alter table public.ai_tool_executions
  add column story_scene_id uuid references public.story_scenes (id) on delete set null,
  add column story_input jsonb check (
    story_input is null or jsonb_typeof(story_input) = 'object'
  );

create function public.update_primary_story_scene_narration(
  target_canvas_id uuid,
  target_scene_id uuid,
  target_expected_revision bigint,
  target_narration text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_story public.stories%rowtype;
  changed_count integer;
  next_revision bigint;
begin
  selected_story := private.lock_primary_story(target_canvas_id, target_expected_revision);
  if target_narration is not null and char_length(target_narration) > 100000 then
    raise exception 'Scene narration must contain at most 100000 characters.' using errcode = '22023';
  end if;
  update public.story_scenes scene
  set narration = nullif(btrim(target_narration), '')
  where scene.id = target_scene_id
    and scene.story_id = selected_story.id
    and scene.deleted_at is null;
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'The scene is unavailable.' using errcode = 'P0002';
  end if;
  update public.stories story
  set revision = story.revision + 1
  where story.id = selected_story.id
  returning revision into next_revision;
  return next_revision;
end;
$$;

revoke all on function public.update_primary_story_scene_narration(uuid, uuid, bigint, text)
  from public, anon;
grant execute on function public.update_primary_story_scene_narration(uuid, uuid, bigint, text)
  to authenticated;

create function public.execute_ai_story_scene(
  target_run_id uuid,
  target_requester_id uuid,
  target_call_key text,
  target_action text,
  target_scene_id uuid,
  target_title text,
  target_narration text,
  target_camera jsonb,
  target_region jsonb,
  target_object_ids uuid[] default array[]::uuid[]
)
returns table (tool_execution_id uuid, scene_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.ai_runs%rowtype;
  target_story public.stories%rowtype;
  existing_execution public.ai_tool_executions%rowtype;
  next_execution_id uuid := extensions.gen_random_uuid();
  next_scene_id uuid := extensions.gen_random_uuid();
  next_position integer;
  requester_role public.canvas_role;
  requester_authority public.ai_authority_level;
  normalized_input jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_call_key is null or char_length(target_call_key) not between 1 and 255 then
    raise exception 'Tool call identity is invalid.' using errcode = '22023';
  end if;
  if target_action not in ('create', 'update_current') then
    raise exception 'Story scene action is invalid.' using errcode = '22023';
  end if;
  if target_title is not null and char_length(btrim(target_title)) not between 1 and 120 then
    raise exception 'Scene title must contain between 1 and 120 characters.' using errcode = '22023';
  end if;
  if target_narration is not null and char_length(target_narration) > 100000 then
    raise exception 'Scene narration must contain at most 100000 characters.' using errcode = '22023';
  end if;

  normalized_input := jsonb_build_object(
    'action', target_action,
    'sceneId', target_scene_id,
    'title', target_title,
    'narration', target_narration,
    'camera', target_camera,
    'region', target_region,
    'objectIds', to_jsonb(coalesce(target_object_ids, array[]::uuid[]))
  );

  select * into target_run
  from public.ai_runs
  where id = target_run_id and requested_by = target_requester_id
  for update;
  if not found or target_run.status not in ('projecting', 'thinking', 'tool_pending') then
    raise exception 'AI run is not available for story execution.' using errcode = '42501';
  end if;

  select membership.role,
    case when settings.enabled then settings.authority else null end
  into requester_role, requester_authority
  from public.canvas_members membership
  join public.canvas_ai_settings settings on settings.canvas_id = membership.canvas_id
  where membership.canvas_id = target_run.canvas_id
    and membership.user_id = target_requester_id;
  if requester_role not in ('owner', 'editor')
    or requester_authority <> 'trusted_editor' then
    raise exception 'Trusted AI story editing is not permitted.' using errcode = '42501';
  end if;

  select * into existing_execution
  from public.ai_tool_executions
  where run_id = target_run.id and call_key = target_call_key;
  if found then
    if existing_execution.tool_name <> 'execute_story_scene'
      or existing_execution.outcome <> 'succeeded'
      or existing_execution.story_scene_id is null
      or existing_execution.story_input is distinct from normalized_input then
      raise exception 'The tool call identity was reused with different or incomplete work.' using errcode = '23505';
    end if;
    return query select existing_execution.id, existing_execution.story_scene_id, false;
    return;
  end if;

  select story.* into target_story
  from public.stories story
  where story.canvas_id = target_run.canvas_id and story.kind = 'general'
  for update;
  if target_story.id is null then
    raise exception 'The primary story does not exist.' using errcode = 'P0002';
  end if;

  if target_action = 'create' then
    if target_scene_id is not null or target_title is null
      or target_camera is null or target_region is null
      or cardinality(coalesce(target_object_ids, array[]::uuid[])) < 1 then
      raise exception 'A new AI scene requires a title and grounded framing.' using errcode = '22023';
    end if;
    select coalesce(max(scene.position), -1) + 1 into next_position
    from public.story_scenes scene
    where scene.story_id = target_story.id and scene.deleted_at is null;
    insert into public.story_scenes (
      id, story_id, title, position, target, camera, narration
    ) values (
      next_scene_id, target_story.id, btrim(target_title), next_position,
      target_region, target_camera, nullif(btrim(target_narration), '')
    );
  else
    if target_scene_id is null or (target_title is null and target_narration is null)
      or target_camera is not null or target_region is not null then
      raise exception 'An AI scene update requires current-scene text changes only.' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.comment_scene_targets scene_target
      where scene_target.comment_id = target_run.invoking_comment_id
        and scene_target.scene_id = target_scene_id
    ) then
      raise exception 'The AI scene target is not the invoking scene.' using errcode = '42501';
    end if;
    update public.story_scenes scene
    set title = coalesce(btrim(target_title), scene.title),
        narration = case
          when target_narration is null then scene.narration
          else nullif(btrim(target_narration), '')
        end
    where scene.id = target_scene_id
      and scene.story_id = target_story.id
      and scene.deleted_at is null;
    if not found then
      raise exception 'The AI scene target is unavailable.' using errcode = 'P0002';
    end if;
    next_scene_id := target_scene_id;
  end if;

  insert into public.ai_tool_executions (
    id, run_id, call_key, tool_name, affected_object_ids,
    outcome, story_scene_id, story_input
  ) values (
    next_execution_id, target_run.id, target_call_key,
    'execute_story_scene', coalesce(target_object_ids, array[]::uuid[]),
    'succeeded', next_scene_id, normalized_input
  );

  update public.stories story
  set revision = story.revision + 1
  where story.id = target_story.id;

  return query select next_execution_id, next_scene_id, true;
end;
$$;

revoke all on function public.execute_ai_story_scene(
  uuid, uuid, text, text, uuid, text, text, jsonb, jsonb, uuid[]
) from public, anon, authenticated;
grant execute on function public.execute_ai_story_scene(
  uuid, uuid, text, text, uuid, text, text, jsonb, jsonb, uuid[]
) to service_role;

comment on function public.execute_ai_story_scene(
  uuid, uuid, text, text, uuid, text, text, jsonb, jsonb, uuid[]
) is 'Executes one idempotent trusted-editor story action grounded by an invoking scene comment.';
