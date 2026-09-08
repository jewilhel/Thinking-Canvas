create table public.comment_scene_targets (
  comment_id uuid primary key references public.comments (id) on delete cascade,
  scene_id uuid not null references public.story_scenes (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index comment_scene_targets_scene_idx
  on public.comment_scene_targets (scene_id, comment_id);

alter table public.comment_scene_targets enable row level security;

create policy comment_scene_targets_select
  on public.comment_scene_targets for select to authenticated
  using (private.canvas_role(private.comment_canvas(comment_id)) is not null);

revoke insert, update, delete on table public.comment_scene_targets from authenticated;
grant select on table public.comment_scene_targets to authenticated;

create function public.create_scene_comment_thread(
  target_canvas_id uuid,
  target_scene_id uuid,
  target_client_command_id uuid,
  target_body text,
  target_prompt_kind public.comment_prompt_kind default null,
  target_author_kind public.comment_author_kind default 'human',
  target_author_key text default null,
  target_recipient_user_ids uuid[] default null,
  target_include_primary_ai boolean default false
)
returns table (comment_id uuid, created boolean, ai_run_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.canvas_role;
  normalized_author_key text;
  normalized_recipient_ids uuid[] := coalesce(
    array(
      select recipient_id
      from unnest(coalesce(target_recipient_user_ids, array[]::uuid[])) recipient_id
      order by recipient_id
    ),
    array[]::uuid[]
  );
  fingerprint text;
  existing public.comments%rowtype;
  next_comment_id uuid := extensions.gen_random_uuid();
  next_run_id uuid;
  routing_explicit boolean := target_recipient_user_ids is not null or target_include_primary_ai;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  actor_role := private.canvas_role(target_canvas_id);
  if actor_role is null or actor_role not in ('owner', 'editor', 'commenter') then
    raise exception 'Comment creation is not permitted.' using errcode = '42501';
  end if;
  if target_author_kind = 'ai' and actor_role not in ('owner', 'editor') then
    raise exception 'AI comment creation is not permitted.' using errcode = '42501';
  end if;
  if target_body is null or char_length(target_body) not between 1 and 100000 then
    raise exception 'Comment body is invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.story_scenes scene
    join public.stories story on story.id = scene.story_id
    where scene.id = target_scene_id
      and scene.deleted_at is null
      and story.canvas_id = target_canvas_id
      and story.kind = 'general'
  ) then
    raise exception 'The active scene is not available on this canvas.' using errcode = '22023';
  end if;

  normalized_author_key := case
    when target_author_kind = 'human' then actor_id::text
    when target_author_key = 'primary-ai' then target_author_key
    else null
  end;
  if normalized_author_key is null then
    raise exception 'Comment author provenance is invalid.' using errcode = '22023';
  end if;

  fingerprint := private.feedback_fingerprint(concat_ws(
    '|', target_canvas_id::text, target_scene_id::text, target_body,
    coalesce(target_prompt_kind::text, ''), target_author_kind::text,
    normalized_author_key, normalized_recipient_ids::text,
    target_include_primary_ai::text, routing_explicit::text
  ));

  select * into existing
  from public.comments
  where canvas_id = target_canvas_id
    and client_command_id = target_client_command_id;
  if found then
    if existing.command_fingerprint <> fingerprint then
      raise exception 'The comment command ID was reused with different content.' using errcode = '23505';
    end if;
    select id into next_run_id from public.ai_runs
    where canvas_id = target_canvas_id and idempotency_key = target_client_command_id;
    return query select existing.id, false, next_run_id;
    return;
  end if;

  insert into public.comments (
    id, canvas_id, author_id, author_kind, author_key,
    client_command_id, command_fingerprint, body
  ) values (
    next_comment_id, target_canvas_id, actor_id, target_author_kind,
    normalized_author_key, target_client_command_id, fingerprint, target_body
  );

  insert into public.comment_scene_targets (comment_id, scene_id)
  values (next_comment_id, target_scene_id);

  if target_prompt_kind is not null then
    insert into public.comment_prompts (comment_id, kind, minimum, maximum)
    values (
      next_comment_id, target_prompt_kind,
      case when target_prompt_kind = 'rating' then 1 else null end,
      case when target_prompt_kind = 'rating' then 5 else null end
    );
  end if;

  if routing_explicit then
    next_run_id := private.apply_comment_routing(
      next_comment_id, null, target_author_kind, normalized_author_key,
      target_recipient_user_ids, target_include_primary_ai, true,
      array[]::uuid[], target_client_command_id
    );
  end if;

  return query select next_comment_id, true, next_run_id;
end;
$$;

revoke all on function public.create_scene_comment_thread(
  uuid, uuid, uuid, text, public.comment_prompt_kind,
  public.comment_author_kind, text, uuid[], boolean
) from public, anon;
grant execute on function public.create_scene_comment_thread(
  uuid, uuid, uuid, text, public.comment_prompt_kind,
  public.comment_author_kind, text, uuid[], boolean
) to authenticated;

comment on table public.comment_scene_targets is
  'Associates an existing threaded comment with one guided scene. Soft-deleted scenes remain available as labeled comment history.';
