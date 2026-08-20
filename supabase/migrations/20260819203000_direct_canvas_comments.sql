alter table public.comments
  add column anchor_x double precision,
  add column anchor_y double precision,
  add constraint comments_anchor_pair
    check ((anchor_x is null) = (anchor_y is null)),
  add constraint comments_anchor_bounds
    check (
      anchor_x is null
      or (
        anchor_x between -1000000000 and 1000000000
        and anchor_y between -1000000000 and 1000000000
      )
    );

drop function public.create_comment_thread(
  uuid,
  uuid,
  text,
  uuid[],
  public.comment_prompt_kind,
  public.comment_author_kind,
  text
);

create function public.create_comment_thread(
  target_canvas_id uuid,
  target_client_command_id uuid,
  target_body text,
  target_object_ids uuid[] default array[]::uuid[],
  target_prompt_kind public.comment_prompt_kind default null,
  target_author_kind public.comment_author_kind default 'human',
  target_author_key text default null,
  target_anchor_x double precision default null,
  target_anchor_y double precision default null
)
returns table (comment_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.canvas_role;
  normalized_author_key text;
  fingerprint text;
  existing public.comments%rowtype;
  next_comment_id uuid := extensions.gen_random_uuid();
  object_target_count integer := cardinality(coalesce(target_object_ids, array[]::uuid[]));
  has_canvas_anchor boolean := target_anchor_x is not null and target_anchor_y is not null;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  actor_role := private.canvas_role(target_canvas_id);
  if actor_role is null or actor_role not in ('owner', 'editor', 'commenter') then
    raise exception 'Comment creation is not permitted.' using errcode = '42501';
  end if;
  if target_author_kind = 'ai' and (actor_role is null or actor_role not in ('owner', 'editor')) then
    raise exception 'AI comment creation is not permitted.' using errcode = '42501';
  end if;
  if target_body is null or char_length(target_body) not between 1 and 100000 then
    raise exception 'Comment body is invalid.' using errcode = '22023';
  end if;
  if (target_anchor_x is null) <> (target_anchor_y is null) then
    raise exception 'Canvas comment coordinates must be supplied together.' using errcode = '22023';
  end if;
  if object_target_count > 100 then
    raise exception 'A comment supports at most 100 target objects.' using errcode = '22023';
  end if;
  if (object_target_count > 0) = has_canvas_anchor then
    raise exception 'A comment requires exactly one object target set or canvas position.' using errcode = '22023';
  end if;
  if has_canvas_anchor and not (
    target_anchor_x between -1000000000 and 1000000000
    and target_anchor_y between -1000000000 and 1000000000
  ) then
    raise exception 'Canvas comment coordinates are invalid.' using errcode = '22023';
  end if;
  if object_target_count > 0 and (
    select count(distinct target_id)
    from unnest(target_object_ids) target_id
  ) <> object_target_count then
    raise exception 'Comment targets must be unique.' using errcode = '22023';
  end if;

  normalized_author_key := case
    when target_author_kind = 'human' then actor_id::text
    when target_author_key = 'primary-ai' then target_author_key
    else null
  end;
  if normalized_author_key is null then
    raise exception 'Comment author provenance is invalid.' using errcode = '22023';
  end if;

  fingerprint := private.feedback_fingerprint(
    concat_ws(
      '|',
      target_canvas_id::text,
      target_body,
      coalesce(target_object_ids, array[]::uuid[])::text,
      coalesce(target_anchor_x::text, ''),
      coalesce(target_anchor_y::text, ''),
      coalesce(target_prompt_kind::text, ''),
      target_author_kind::text,
      normalized_author_key
    )
  );

  select * into existing
  from public.comments
  where canvas_id = target_canvas_id
    and client_command_id = target_client_command_id;

  if found then
    if existing.command_fingerprint <> fingerprint then
      raise exception 'The comment command ID was reused with different content.' using errcode = '23505';
    end if;
    return query select existing.id, false;
    return;
  end if;

  insert into public.comments (
    id,
    canvas_id,
    author_id,
    author_kind,
    author_key,
    client_command_id,
    command_fingerprint,
    body,
    anchor_x,
    anchor_y
  ) values (
    next_comment_id,
    target_canvas_id,
    actor_id,
    target_author_kind,
    normalized_author_key,
    target_client_command_id,
    fingerprint,
    target_body,
    target_anchor_x,
    target_anchor_y
  );

  if object_target_count > 0 then
    insert into public.comment_targets (comment_id, target_object_id)
    select next_comment_id, target_id
    from unnest(target_object_ids) target_id;
  end if;

  if target_prompt_kind is not null then
    insert into public.comment_prompts (comment_id, kind, minimum, maximum)
    values (
      next_comment_id,
      target_prompt_kind,
      case when target_prompt_kind = 'rating' then 1 else null end,
      case when target_prompt_kind = 'rating' then 5 else null end
    );
  end if;

  return query select next_comment_id, true;
end;
$$;

revoke all on function public.create_comment_thread(
  uuid,
  uuid,
  text,
  uuid[],
  public.comment_prompt_kind,
  public.comment_author_kind,
  text,
  double precision,
  double precision
) from public, anon;

grant execute on function public.create_comment_thread(
  uuid,
  uuid,
  text,
  uuid[],
  public.comment_prompt_kind,
  public.comment_author_kind,
  text,
  double precision,
  double precision
) to authenticated;
