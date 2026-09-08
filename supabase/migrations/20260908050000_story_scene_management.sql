alter table public.story_scenes
  add column deleted_at timestamptz;

alter table public.story_scenes
  drop constraint story_scenes_story_id_position_key;

create unique index story_scenes_active_story_position_unique_idx
  on public.story_scenes (story_id, position)
  where deleted_at is null;

create or replace function private.lock_primary_story(
  target_canvas_id uuid,
  target_expected_revision bigint
)
returns public.stories
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_story public.stories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.has_canvas_role(
    target_canvas_id,
    array['owner', 'editor']::public.canvas_role[]
  ) then
    raise exception 'Story editing requires owner or editor access.' using errcode = '42501';
  end if;
  select story.*
  into selected_story
  from public.stories story
  where story.canvas_id = target_canvas_id and story.kind = 'general'
  for update;
  if selected_story.id is null then
    raise exception 'The primary story does not exist.' using errcode = 'P0002';
  end if;
  if selected_story.revision <> target_expected_revision then
    raise exception 'The story changed in another session.' using errcode = '40001';
  end if;
  return selected_story;
end;
$$;

revoke all on function private.lock_primary_story(uuid, bigint) from public, anon, authenticated;

create or replace function public.update_primary_story_scene(
  target_canvas_id uuid,
  target_scene_id uuid,
  target_expected_revision bigint,
  target_title text default null,
  target_camera jsonb default null,
  target_region jsonb default null
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
  if target_title is null and target_camera is null and target_region is null then
    raise exception 'A scene change is required.' using errcode = '22023';
  end if;
  if target_title is not null and char_length(btrim(target_title)) not between 1 and 120 then
    raise exception 'Scene title must contain between 1 and 120 characters.' using errcode = '22023';
  end if;
  if (target_camera is null) <> (target_region is null) then
    raise exception 'Camera and target must be replaced together.' using errcode = '22023';
  end if;
  update public.story_scenes scene
  set
    title = coalesce(btrim(target_title), scene.title),
    camera = coalesce(target_camera, scene.camera),
    target = coalesce(target_region, scene.target)
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

create or replace function public.reorder_primary_story_scenes(
  target_canvas_id uuid,
  target_scene_ids uuid[],
  target_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_story public.stories%rowtype;
  active_count integer;
  supplied_count integer;
  next_revision bigint;
begin
  selected_story := private.lock_primary_story(target_canvas_id, target_expected_revision);
  select count(*)::integer
  into active_count
  from public.story_scenes scene
  where scene.story_id = selected_story.id and scene.deleted_at is null;
  select count(distinct scene_id)::integer
  into supplied_count
  from unnest(target_scene_ids) scene_id;
  if cardinality(target_scene_ids) <> active_count or supplied_count <> active_count then
    raise exception 'The ordered scene list must contain every active scene exactly once.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(target_scene_ids) scene_id
    left join public.story_scenes scene
      on scene.id = scene_id
      and scene.story_id = selected_story.id
      and scene.deleted_at is null
    where scene.id is null
  ) then
    raise exception 'The ordered scene list contains an unavailable scene.' using errcode = '22023';
  end if;
  update public.story_scenes scene
  set position = scene.position + 1000000
  where scene.story_id = selected_story.id and scene.deleted_at is null;
  update public.story_scenes scene
  set position = ordered.ordinality::integer - 1
  from unnest(target_scene_ids) with ordinality ordered(scene_id, ordinality)
  where scene.id = ordered.scene_id and scene.story_id = selected_story.id;
  update public.stories story
  set revision = story.revision + 1
  where story.id = selected_story.id
  returning revision into next_revision;
  return next_revision;
end;
$$;

create or replace function public.delete_primary_story_scene(
  target_canvas_id uuid,
  target_scene_id uuid,
  target_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_story public.stories%rowtype;
  deleted_position integer;
  next_revision bigint;
begin
  selected_story := private.lock_primary_story(target_canvas_id, target_expected_revision);
  update public.story_scenes scene
  set deleted_at = now()
  where scene.id = target_scene_id
    and scene.story_id = selected_story.id
    and scene.deleted_at is null
  returning position into deleted_position;
  if deleted_position is null then
    raise exception 'The scene is unavailable.' using errcode = 'P0002';
  end if;
  update public.story_scenes scene
  set position = scene.position - 1
  where scene.story_id = selected_story.id
    and scene.deleted_at is null
    and scene.position > deleted_position;
  update public.stories story
  set revision = story.revision + 1
  where story.id = selected_story.id
  returning revision into next_revision;
  return next_revision;
end;
$$;

create or replace function public.restore_primary_story_scene(
  target_canvas_id uuid,
  target_scene_id uuid,
  target_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_story public.stories%rowtype;
  active_count integer;
  restored_position integer;
  next_revision bigint;
begin
  selected_story := private.lock_primary_story(target_canvas_id, target_expected_revision);
  select scene.position
  into restored_position
  from public.story_scenes scene
  where scene.id = target_scene_id
    and scene.story_id = selected_story.id
    and scene.deleted_at is not null;
  if restored_position is null then
    raise exception 'The deleted scene is unavailable.' using errcode = 'P0002';
  end if;
  select count(*)::integer
  into active_count
  from public.story_scenes scene
  where scene.story_id = selected_story.id and scene.deleted_at is null;
  restored_position := least(restored_position, active_count);
  update public.story_scenes scene
  set position = scene.position + 1000000
  where scene.story_id = selected_story.id
    and scene.deleted_at is null
    and scene.position >= restored_position;
  update public.story_scenes scene
  set position = scene.position - 999999
  where scene.story_id = selected_story.id
    and scene.deleted_at is null
    and scene.position >= restored_position + 1000000;
  update public.story_scenes scene
  set deleted_at = null
  where scene.id = target_scene_id;
  update public.stories story
  set revision = story.revision + 1
  where story.id = selected_story.id
  returning revision into next_revision;
  return next_revision;
end;
$$;

revoke all on function public.update_primary_story_scene(uuid, uuid, bigint, text, jsonb, jsonb) from public, anon;
revoke all on function public.reorder_primary_story_scenes(uuid, uuid[], bigint) from public, anon;
revoke all on function public.delete_primary_story_scene(uuid, uuid, bigint) from public, anon;
revoke all on function public.restore_primary_story_scene(uuid, uuid, bigint) from public, anon;

grant execute on function public.update_primary_story_scene(uuid, uuid, bigint, text, jsonb, jsonb) to authenticated;
grant execute on function public.reorder_primary_story_scenes(uuid, uuid[], bigint) to authenticated;
grant execute on function public.delete_primary_story_scene(uuid, uuid, bigint) to authenticated;
grant execute on function public.restore_primary_story_scene(uuid, uuid, bigint) to authenticated;
