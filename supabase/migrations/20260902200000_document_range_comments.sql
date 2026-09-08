create table public.comment_document_targets (
  comment_id uuid primary key references public.comments (id) on delete cascade,
  document_object_id uuid not null,
  relative_anchor text not null check (char_length(relative_anchor) between 1 and 4096),
  relative_head text not null check (char_length(relative_head) between 1 and 4096),
  quoted_text text not null check (char_length(quoted_text) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_change_sets
  add column document_object_id uuid,
  add column document_undo_update bytea,
  add constraint ai_change_sets_document_undo_shape check (
    (document_object_id is null and document_undo_update is null)
    or (
      document_object_id is not null
      and document_undo_update is not null
      and octet_length(document_undo_update) > 0
    )
  );

create index comment_document_targets_document_idx
  on public.comment_document_targets (document_object_id, comment_id);

alter table public.comment_document_targets enable row level security;

create policy comment_document_targets_select
  on public.comment_document_targets for select to authenticated
  using (private.canvas_role(private.comment_canvas(comment_id)) is not null);

revoke insert, update, delete on table public.comment_document_targets from authenticated;
grant select on table public.comment_document_targets to authenticated;

drop function public.create_comment_thread(
  uuid, uuid, text, uuid[], public.comment_prompt_kind,
  public.comment_author_kind, text, double precision, double precision,
  uuid[], boolean, uuid[]
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
  target_anchor_y double precision default null,
  target_recipient_user_ids uuid[] default null,
  target_include_primary_ai boolean default false,
  target_ordered_context_ids uuid[] default array[]::uuid[],
  target_document_object_id uuid default null,
  target_document_relative_anchor text default null,
  target_document_relative_head text default null,
  target_document_quoted_text text default null
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
  object_target_count integer := cardinality(coalesce(target_object_ids, array[]::uuid[]));
  has_canvas_anchor boolean := target_anchor_x is not null and target_anchor_y is not null;
  has_document_range boolean := target_document_object_id is not null;
  target_family_count integer;
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
  if (target_anchor_x is null) <> (target_anchor_y is null) then
    raise exception 'Canvas comment coordinates must be supplied together.' using errcode = '22023';
  end if;
  if object_target_count > 100 then
    raise exception 'A comment supports at most 100 target objects.' using errcode = '22023';
  end if;
  target_family_count :=
    case when object_target_count > 0 then 1 else 0 end +
    case when has_canvas_anchor then 1 else 0 end +
    case when has_document_range then 1 else 0 end;
  if target_family_count <> 1 then
    raise exception 'A comment requires exactly one object target set, canvas position, or document range.' using errcode = '22023';
  end if;
  if has_canvas_anchor and not (
    target_anchor_x between -1000000000 and 1000000000
    and target_anchor_y between -1000000000 and 1000000000
  ) then
    raise exception 'Canvas comment coordinates are invalid.' using errcode = '22023';
  end if;
  if has_document_range and (
    target_document_relative_anchor is null
    or char_length(target_document_relative_anchor) not between 1 and 4096
    or target_document_relative_head is null
    or char_length(target_document_relative_head) not between 1 and 4096
    or target_document_quoted_text is null
    or char_length(target_document_quoted_text) not between 1 and 1000
  ) then
    raise exception 'Document range target is invalid.' using errcode = '22023';
  end if;
  if not has_document_range and (
    target_document_relative_anchor is not null
    or target_document_relative_head is not null
    or target_document_quoted_text is not null
  ) then
    raise exception 'Document range fields require a document target.' using errcode = '22023';
  end if;
  if object_target_count > 0 and (
    select count(distinct target_id) from unnest(target_object_ids) target_id
  ) <> object_target_count then
    raise exception 'Comment targets must be unique.' using errcode = '22023';
  end if;
  if cardinality(coalesce(target_ordered_context_ids, array[]::uuid[])) > 1000 then
    raise exception 'An ordered AI context supports at most 1000 objects.' using errcode = '22023';
  end if;
  if cardinality(coalesce(target_ordered_context_ids, array[]::uuid[])) <> (
    select count(distinct context_id)
    from unnest(coalesce(target_ordered_context_ids, array[]::uuid[])) context_id
  ) then
    raise exception 'Ordered AI context objects must be unique.' using errcode = '22023';
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
    '|', target_canvas_id::text, target_body,
    coalesce(target_object_ids, array[]::uuid[])::text,
    coalesce(target_anchor_x::text, ''), coalesce(target_anchor_y::text, ''),
    coalesce(target_prompt_kind::text, ''), target_author_kind::text,
    normalized_author_key, normalized_recipient_ids::text,
    target_include_primary_ai::text, routing_explicit::text,
    target_ordered_context_ids::text,
    coalesce(target_document_object_id::text, ''),
    coalesce(target_document_relative_anchor, ''),
    coalesce(target_document_relative_head, ''),
    coalesce(target_document_quoted_text, '')
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
    client_command_id, command_fingerprint, body, anchor_x, anchor_y
  ) values (
    next_comment_id, target_canvas_id, actor_id, target_author_kind,
    normalized_author_key, target_client_command_id, fingerprint,
    target_body, target_anchor_x, target_anchor_y
  );

  if object_target_count > 0 then
    insert into public.comment_targets (comment_id, target_object_id, target_order)
    select next_comment_id, target_id, target_order - 1
    from unnest(target_object_ids) with ordinality target(target_id, target_order);
  end if;
  if has_document_range then
    insert into public.comment_document_targets (
      comment_id, document_object_id, relative_anchor, relative_head, quoted_text
    ) values (
      next_comment_id, target_document_object_id,
      target_document_relative_anchor, target_document_relative_head,
      target_document_quoted_text
    );
  end if;
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
      target_ordered_context_ids, target_client_command_id
    );
  end if;

  return query select next_comment_id, true, next_run_id;
end;
$$;

revoke all on function public.create_comment_thread(
  uuid, uuid, text, uuid[], public.comment_prompt_kind,
  public.comment_author_kind, text, double precision, double precision,
  uuid[], boolean, uuid[], uuid, text, text, text
) from public, anon;
grant execute on function public.create_comment_thread(
  uuid, uuid, text, uuid[], public.comment_prompt_kind,
  public.comment_author_kind, text, double precision, double precision,
  uuid[], boolean, uuid[], uuid, text, text, text
) to authenticated;

comment on table public.comment_document_targets is
  'Durable Yjs-relative text range targets. If anchors detach, retain the quoted text as thread history.';
