create type public.comment_author_kind as enum ('human', 'ai');

alter table public.comments
  add column author_kind public.comment_author_kind not null default 'human',
  add column author_key text,
  add column client_command_id uuid,
  add column command_fingerprint text;

update public.comments
set author_key = author_id::text
where author_key is null;

alter table public.comments
  alter column author_key set not null,
  add constraint comments_author_key_length
    check (char_length(author_key) between 1 and 255),
  add constraint comments_command_fingerprint_length
    check (command_fingerprint is null or char_length(command_fingerprint) = 64),
  add constraint comments_human_author_key
    check (author_kind <> 'human' or author_key = author_id::text),
  add constraint comments_canvas_client_command_unique
    unique (canvas_id, client_command_id);

create function private.normalize_comment_author()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.author_kind = 'human' then
    new.author_key := new.author_id::text;
  elsif new.author_key is null then
    raise exception 'AI comments require a logical author key.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger comments_normalize_author
  before insert or update of author_id, author_kind, author_key
  on public.comments
  for each row execute function private.normalize_comment_author();

alter table public.comment_replies
  add column client_command_id uuid,
  add column command_fingerprint text,
  add constraint comment_replies_command_fingerprint_length
    check (command_fingerprint is null or char_length(command_fingerprint) = 64),
  add constraint comment_replies_comment_client_command_unique
    unique (comment_id, client_command_id);

alter table public.comment_responses
  add column client_command_id uuid;

create index comments_canvas_status_created_idx
  on public.comments (canvas_id, status, created_at, id);

create index comment_targets_comment_created_idx
  on public.comment_targets (comment_id, created_at, id);

create function private.feedback_fingerprint(payload text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(payload, 'UTF8'), 'sha256'), 'hex');
$$;

create function private.valid_comment_response(
  prompt_kind public.comment_prompt_kind,
  response_value jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case prompt_kind
    when 'yes_no' then
      response_value = jsonb_build_object('answer', response_value ->> 'answer')
      and response_value ->> 'answer' in ('yes', 'no')
    when 'review' then
      response_value = jsonb_build_object('decision', response_value ->> 'decision')
      and response_value ->> 'decision' in ('approve', 'revise', 'discard')
    when 'rating' then
      response_value = jsonb_build_object('rating', response_value -> 'rating')
      and jsonb_typeof(response_value -> 'rating') = 'number'
      and response_value ->> 'rating' ~ '^[1-5]$'
    else false
  end;
$$;

create function public.create_comment_thread(
  target_canvas_id uuid,
  target_client_command_id uuid,
  target_body text,
  target_object_ids uuid[],
  target_prompt_kind public.comment_prompt_kind default null,
  target_author_kind public.comment_author_kind default 'human',
  target_author_key text default null
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
  if target_object_ids is null or cardinality(target_object_ids) not between 1 and 100 then
    raise exception 'A comment requires between 1 and 100 target objects.' using errcode = '22023';
  end if;
  if (select count(distinct target_id) from unnest(target_object_ids) target_id) <> cardinality(target_object_ids) then
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
      target_object_ids::text,
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
    body
  ) values (
    next_comment_id,
    target_canvas_id,
    actor_id,
    target_author_kind,
    normalized_author_key,
    target_client_command_id,
    fingerprint,
    target_body
  );

  insert into public.comment_targets (comment_id, target_object_id)
  select next_comment_id, target_id
  from unnest(target_object_ids) target_id;

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

create function public.create_comment_reply(
  target_comment_id uuid,
  target_client_command_id uuid,
  target_body text
)
returns table (reply_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_comment public.comments%rowtype;
  fingerprint text;
  existing public.comment_replies%rowtype;
  next_reply_id uuid := extensions.gen_random_uuid();
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into target_comment from public.comments where id = target_comment_id;
  if not found then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;
  if not private.has_canvas_role(target_comment.canvas_id, array['owner', 'editor', 'commenter']::public.canvas_role[]) then
    raise exception 'Reply creation is not permitted.' using errcode = '42501';
  end if;
  if target_comment.status <> 'open' then
    raise exception 'Closed comments are read-only.' using errcode = '22023';
  end if;
  if target_body is null or char_length(target_body) not between 1 and 100000 then
    raise exception 'Reply body is invalid.' using errcode = '22023';
  end if;

  fingerprint := private.feedback_fingerprint(concat_ws('|', target_comment_id::text, target_body));
  select * into existing
  from public.comment_replies
  where comment_id = target_comment_id
    and client_command_id = target_client_command_id;
  if found then
    if existing.command_fingerprint <> fingerprint then
      raise exception 'The reply command ID was reused with different content.' using errcode = '23505';
    end if;
    return query select existing.id, false;
    return;
  end if;

  insert into public.comment_replies (
    id, comment_id, author_id, client_command_id, command_fingerprint, body
  ) values (
    next_reply_id, target_comment_id, actor_id, target_client_command_id, fingerprint, target_body
  );
  return query select next_reply_id, true;
end;
$$;

create function public.respond_to_comment_prompt(
  target_prompt_id uuid,
  target_client_command_id uuid,
  target_value jsonb
)
returns table (response_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_prompt public.comment_prompts%rowtype;
  target_comment public.comments%rowtype;
  existing public.comment_responses%rowtype;
  next_response_id uuid := extensions.gen_random_uuid();
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into target_prompt from public.comment_prompts where id = target_prompt_id;
  if not found then
    raise exception 'Prompt not found.' using errcode = 'P0002';
  end if;
  select * into target_comment from public.comments where id = target_prompt.comment_id;
  if not private.has_canvas_role(target_comment.canvas_id, array['owner', 'editor', 'commenter']::public.canvas_role[]) then
    raise exception 'Prompt response is not permitted.' using errcode = '42501';
  end if;
  if target_comment.status <> 'open' then
    raise exception 'Closed comments are read-only.' using errcode = '22023';
  end if;
  if not private.valid_comment_response(target_prompt.kind, target_value) then
    raise exception 'Prompt response is invalid.' using errcode = '22023';
  end if;

  select * into existing
  from public.comment_responses
  where prompt_id = target_prompt_id and responder_id = actor_id;

  if found then
    if existing.client_command_id = target_client_command_id and existing.value <> target_value then
      raise exception 'The response command ID was reused with different content.' using errcode = '23505';
    end if;
    if existing.client_command_id = target_client_command_id then
      return query select existing.id, false;
      return;
    end if;
    update public.comment_responses
    set value = target_value,
        client_command_id = target_client_command_id,
        updated_at = now()
    where id = existing.id;
    return query select existing.id, false;
    return;
  end if;

  insert into public.comment_responses (
    id, prompt_id, responder_id, client_command_id, value
  ) values (
    next_response_id, target_prompt_id, actor_id, target_client_command_id, target_value
  );
  return query select next_response_id, true;
end;
$$;

create function public.transition_comment_status(
  target_comment_id uuid,
  target_status public.comment_status
)
returns public.comment_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_comment public.comments%rowtype;
  actor_role public.canvas_role;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if target_status not in ('resolved', 'dismissed') then
    raise exception 'Only resolve and dismiss transitions are supported.' using errcode = '22023';
  end if;
  select * into target_comment from public.comments where id = target_comment_id;
  if not found then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;
  actor_role := private.canvas_role(target_comment.canvas_id);

  if target_status = 'resolved' and not coalesce((
    actor_role in ('owner', 'editor')
    or (actor_role = 'commenter' and target_comment.author_id = actor_id)
  ), false) then
    raise exception 'Resolving this comment is not permitted.' using errcode = '42501';
  end if;
  if target_status = 'dismissed' and not coalesce((
    actor_role = 'owner' or target_comment.author_id = actor_id
  ), false) then
    raise exception 'Dismissing this comment is not permitted.' using errcode = '42501';
  end if;

  update public.comments
  set status = target_status, updated_at = now()
  where id = target_comment_id;
  return target_status;
end;
$$;

revoke insert, update, delete on table public.comments from authenticated;
revoke insert, update, delete on table public.comment_targets from authenticated;
revoke insert, update, delete on table public.comment_replies from authenticated;
revoke insert, update, delete on table public.comment_prompts from authenticated;
revoke insert, update, delete on table public.comment_responses from authenticated;

revoke all on function public.create_comment_thread(uuid, uuid, text, uuid[], public.comment_prompt_kind, public.comment_author_kind, text) from public, anon;
revoke all on function public.create_comment_reply(uuid, uuid, text) from public, anon;
revoke all on function public.respond_to_comment_prompt(uuid, uuid, jsonb) from public, anon;
revoke all on function public.transition_comment_status(uuid, public.comment_status) from public, anon;
grant execute on function public.create_comment_thread(uuid, uuid, text, uuid[], public.comment_prompt_kind, public.comment_author_kind, text) to authenticated;
grant execute on function public.create_comment_reply(uuid, uuid, text) to authenticated;
grant execute on function public.respond_to_comment_prompt(uuid, uuid, jsonb) to authenticated;
grant execute on function public.transition_comment_status(uuid, public.comment_status) to authenticated;

create policy comments_realtime_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() ~ '^comments:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and private.canvas_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
);

create policy comments_realtime_write
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() ~ '^comments:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and private.has_canvas_role(
    split_part(realtime.topic(), ':', 2)::uuid,
    array['owner', 'editor', 'commenter']::public.canvas_role[]
  )
);
