create type public.ai_authority_level as enum (
  'comment_only',
  'propose_changes',
  'edit_with_review',
  'trusted_editor'
);

create type public.ai_run_status as enum (
  'queued',
  'projecting',
  'thinking',
  'tool_pending',
  'applying',
  'completed',
  'cancelled',
  'failed'
);

create type public.ai_tool_outcome as enum (
  'pending',
  'succeeded',
  'denied',
  'cancelled',
  'failed'
);

create type public.comment_recipient_source as enum ('explicit', 'inherited');

create table public.canvas_ai_settings (
  canvas_id uuid primary key references public.canvases (id) on delete cascade,
  enabled boolean not null default false,
  authority public.ai_authority_level not null default 'comment_only',
  version bigint not null default 1 check (version > 0),
  changed_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comment_replies
  add constraint comment_replies_id_comment_unique unique (id, comment_id);

alter table public.comment_replies
  add column author_kind public.comment_author_kind not null default 'human',
  add column author_key text;

update public.comment_replies
set author_key = author_id::text
where author_key is null;

alter table public.comment_replies
  alter column author_key set not null,
  add constraint comment_replies_author_key_length
    check (char_length(author_key) between 1 and 255),
  add constraint comment_replies_human_author_key
    check (author_kind <> 'human' or author_key = author_id::text);

create function private.normalize_comment_reply_author()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.author_kind = 'human' then
    new.author_key := new.author_id::text;
  elsif new.author_key <> 'primary-ai' then
    raise exception 'AI replies require the primary AI author key.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger comment_replies_normalize_author
  before insert or update of author_id, author_kind, author_key
  on public.comment_replies
  for each row execute function private.normalize_comment_reply_author();

create table public.comment_thread_participants (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  participant_kind public.comment_author_kind not null,
  participant_user_id uuid references public.profiles (id) on delete restrict,
  participant_ai_key text,
  routing_version bigint not null check (routing_version > 0),
  changed_by_reply_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comment_thread_participants_reply_thread_fk
    foreign key (changed_by_reply_id, comment_id)
    references public.comment_replies (id, comment_id)
    on delete cascade,
  constraint comment_thread_participants_identity
    check (
      (participant_kind = 'human' and participant_user_id is not null and participant_ai_key is null)
      or
      (participant_kind = 'ai' and participant_user_id is null and participant_ai_key = 'primary-ai')
    )
);

create unique index comment_thread_participants_human_unique
  on public.comment_thread_participants (comment_id, participant_user_id)
  where participant_kind = 'human';

create unique index comment_thread_participants_ai_unique
  on public.comment_thread_participants (comment_id, participant_ai_key)
  where participant_kind = 'ai';

create index comment_thread_participants_comment_routing_idx
  on public.comment_thread_participants (comment_id, routing_version, created_at, id);

create table public.comment_message_recipients (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  reply_id uuid,
  recipient_kind public.comment_author_kind not null,
  recipient_user_id uuid references public.profiles (id) on delete restrict,
  recipient_ai_key text,
  routing_version bigint not null check (routing_version > 0),
  source public.comment_recipient_source not null,
  created_at timestamptz not null default now(),
  constraint comment_message_recipients_reply_thread_fk
    foreign key (reply_id, comment_id)
    references public.comment_replies (id, comment_id)
    on delete cascade,
  constraint comment_message_recipients_identity
    check (
      (recipient_kind = 'human' and recipient_user_id is not null and recipient_ai_key is null)
      or
      (recipient_kind = 'ai' and recipient_user_id is null and recipient_ai_key = 'primary-ai')
    )
);

create unique index comment_message_root_human_recipient_unique
  on public.comment_message_recipients (comment_id, recipient_user_id)
  where reply_id is null and recipient_kind = 'human';

create unique index comment_message_root_ai_recipient_unique
  on public.comment_message_recipients (comment_id, recipient_ai_key)
  where reply_id is null and recipient_kind = 'ai';

create unique index comment_message_reply_human_recipient_unique
  on public.comment_message_recipients (reply_id, recipient_user_id)
  where reply_id is not null and recipient_kind = 'human';

create unique index comment_message_reply_ai_recipient_unique
  on public.comment_message_recipients (reply_id, recipient_ai_key)
  where reply_id is not null and recipient_kind = 'ai';

create index comment_message_recipients_comment_created_idx
  on public.comment_message_recipients (comment_id, created_at, id);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  invoking_comment_id uuid references public.comments (id) on delete set null,
  invoking_reply_id uuid,
  output_comment_id uuid references public.comments (id) on delete set null,
  output_reply_id uuid,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  idempotency_key uuid not null,
  provider_request_id text check (
    provider_request_id is null or char_length(provider_request_id) between 1 and 255
  ),
  model text check (model is null or char_length(model) between 1 and 120),
  authority_snapshot public.ai_authority_level not null,
  ordered_context_ids uuid[] not null default array[]::uuid[] check (
    cardinality(ordered_context_ids) <= 1000
  ),
  projection_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(projection_metadata) = 'object'
  ),
  status public.ai_run_status not null default 'queued',
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  latency_ms bigint check (latency_ms is null or latency_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) between 1 and 120),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_runs_invoking_reply_thread_fk
    foreign key (invoking_reply_id, invoking_comment_id)
    references public.comment_replies (id, comment_id)
    on delete set null,
  constraint ai_runs_output_reply_thread_fk
    foreign key (output_reply_id, output_comment_id)
    references public.comment_replies (id, comment_id)
    on delete set null,
  constraint ai_runs_invocation_shape check (
    invoking_reply_id is null or invoking_comment_id is not null
  ),
  constraint ai_runs_output_shape check (
    output_reply_id is null or output_comment_id is not null
  ),
  unique (canvas_id, idempotency_key)
);

create index ai_runs_canvas_created_idx
  on public.ai_runs (canvas_id, created_at desc, id);

create index ai_runs_requester_created_idx
  on public.ai_runs (requested_by, created_at desc, id);

create index ai_runs_invoking_comment_idx
  on public.ai_runs (invoking_comment_id, created_at, id)
  where invoking_comment_id is not null;

create table public.ai_tool_executions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_runs (id) on delete cascade,
  call_key text not null check (char_length(call_key) between 1 and 255),
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  affected_object_ids uuid[] not null default array[]::uuid[] check (
    cardinality(affected_object_ids) <= 1000
  ),
  outcome public.ai_tool_outcome not null default 'pending',
  command_id uuid,
  comment_id uuid references public.comments (id) on delete set null,
  change_set_id uuid references public.ai_change_sets (id) on delete set null,
  error_code text check (error_code is null or char_length(error_code) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, call_key)
);

create index ai_tool_executions_run_created_idx
  on public.ai_tool_executions (run_id, created_at, id);

create table public.ai_rate_limit_windows (
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null,
  window_ends_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (canvas_id, user_id, window_started_at),
  check (window_ends_at > window_started_at)
);

create index ai_rate_limit_windows_expiry_idx
  on public.ai_rate_limit_windows (window_ends_at);

create function private.ai_run_canvas(target_run_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select canvas_id from public.ai_runs where id = target_run_id;
$$;

create function private.effective_ai_authority(target_canvas_id uuid)
returns public.ai_authority_level
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not settings.enabled then null
    when membership.role in ('owner', 'editor') then settings.authority
    when membership.role = 'commenter' then 'comment_only'::public.ai_authority_level
    else null
  end
  from public.canvas_members membership
  join public.canvas_ai_settings settings on settings.canvas_id = membership.canvas_id
  where membership.canvas_id = target_canvas_id
    and membership.user_id = auth.uid();
$$;

create function public.set_canvas_ai_settings(
  target_canvas_id uuid,
  target_enabled boolean,
  target_authority public.ai_authority_level,
  target_expected_version bigint default null
)
returns table (
  canvas_id uuid,
  enabled boolean,
  authority public.ai_authority_level,
  version bigint,
  changed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  existing public.canvas_ai_settings%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if private.canvas_role(target_canvas_id) <> 'owner' then
    raise exception 'Changing AI settings is not permitted.' using errcode = '42501';
  end if;

  select * into existing
  from public.canvas_ai_settings settings
  where settings.canvas_id = target_canvas_id
  for update;

  if found then
    if target_expected_version is not null and target_expected_version <> existing.version then
      raise exception 'AI settings changed since they were loaded.' using errcode = '40001';
    end if;
    update public.canvas_ai_settings settings
    set enabled = target_enabled,
        authority = target_authority,
        version = existing.version + 1,
        changed_by = actor_id,
        updated_at = now()
    where settings.canvas_id = target_canvas_id;
  else
    if target_expected_version is not null and target_expected_version <> 0 then
      raise exception 'AI settings changed since they were loaded.' using errcode = '40001';
    end if;
    insert into public.canvas_ai_settings (
      canvas_id, enabled, authority, changed_by
    ) values (
      target_canvas_id, target_enabled, target_authority, actor_id
    );
  end if;

  return query
  select
    settings.canvas_id,
    settings.enabled,
    settings.authority,
    settings.version,
    settings.changed_by,
    settings.created_at,
    settings.updated_at
  from public.canvas_ai_settings settings
  where settings.canvas_id = target_canvas_id;
end;
$$;

create function public.get_canvas_ai_access(target_canvas_id uuid)
returns table (
  enabled boolean,
  configured_authority public.ai_authority_level,
  effective_authority public.ai_authority_level,
  can_manage boolean,
  version bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.canvas_role := private.canvas_role(target_canvas_id);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if actor_role is null then
    raise exception 'Canvas access is not permitted.' using errcode = '42501';
  end if;

  return query
  select
    coalesce(settings.enabled, false),
    coalesce(settings.authority, 'comment_only'::public.ai_authority_level),
    private.effective_ai_authority(target_canvas_id),
    actor_role = 'owner',
    coalesce(settings.version, 0)
  from (select 1) singleton
  left join public.canvas_ai_settings settings
    on settings.canvas_id = target_canvas_id;
end;
$$;

create function private.apply_comment_routing(
  target_comment_id uuid,
  target_reply_id uuid,
  target_author_kind public.comment_author_kind,
  target_author_key text,
  target_recipient_user_ids uuid[],
  target_include_primary_ai boolean,
  target_explicit boolean,
  target_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_comment public.comments%rowtype;
  normalized_recipient_ids uuid[] := coalesce(
    array(
      select recipient_id
      from unnest(coalesce(target_recipient_user_ids, array[]::uuid[])) recipient_id
      order by recipient_id
    ),
    array[]::uuid[]
  );
  next_routing_version bigint;
  include_ai_participant boolean := target_include_primary_ai or target_author_kind = 'ai';
  effective_authority public.ai_authority_level;
  next_run_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into target_comment
  from public.comments
  where id = target_comment_id
  for update;
  if not found then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;
  if target_comment.status <> 'open' then
    raise exception 'Closed comments are read-only.' using errcode = '22023';
  end if;
  if target_reply_id is not null and not exists (
    select 1 from public.comment_replies
    where id = target_reply_id and comment_id = target_comment_id
  ) then
    raise exception 'Reply does not belong to the comment thread.' using errcode = '22023';
  end if;
  if target_author_kind = 'human' and target_author_key <> actor_id::text then
    raise exception 'Comment author provenance is invalid.' using errcode = '22023';
  end if;
  if target_author_kind = 'ai' and target_author_key <> 'primary-ai' then
    raise exception 'Comment author provenance is invalid.' using errcode = '22023';
  end if;

  if target_explicit then
    if cardinality(normalized_recipient_ids) > 99 then
      raise exception 'A message supports at most 100 active participants.' using errcode = '22023';
    end if;
    if cardinality(normalized_recipient_ids) <> cardinality(
      coalesce(target_recipient_user_ids, array[]::uuid[])
    ) then
      raise exception 'Collaborator recipients must be unique.' using errcode = '22023';
    end if;
    if cardinality(normalized_recipient_ids) = 0 and not target_include_primary_ai then
      raise exception 'Explicit routing requires at least one recipient.' using errcode = '22023';
    end if;
    if target_author_kind = 'human' and actor_id = any(normalized_recipient_ids) then
      raise exception 'A message author cannot address themselves.' using errcode = '22023';
    end if;
    if (
      select count(*)
      from public.canvas_members membership
      where membership.canvas_id = target_comment.canvas_id
        and membership.user_id = any(normalized_recipient_ids)
    ) <> cardinality(normalized_recipient_ids) then
      raise exception 'Every recipient must be a current canvas collaborator.' using errcode = '42501';
    end if;

    if include_ai_participant then
      effective_authority := private.effective_ai_authority(target_comment.canvas_id);
      if effective_authority is null then
        raise exception 'The primary AI is not available to this participant.' using errcode = '42501';
      end if;
    end if;

    select greatest(
      coalesce((
        select max(routing_version)
        from public.comment_thread_participants
        where comment_id = target_comment_id
      ), 0),
      coalesce((
        select max(routing_version)
        from public.comment_message_recipients
        where comment_id = target_comment_id
      ), 0)
    ) + 1 into next_routing_version;

    delete from public.comment_thread_participants
    where comment_id = target_comment_id;

    if target_author_kind = 'human' then
      insert into public.comment_thread_participants (
        comment_id,
        participant_kind,
        participant_user_id,
        routing_version,
        changed_by_reply_id
      ) values (
        target_comment_id,
        'human',
        actor_id,
        next_routing_version,
        target_reply_id
      );
    else
      insert into public.comment_thread_participants (
        comment_id,
        participant_kind,
        participant_ai_key,
        routing_version,
        changed_by_reply_id
      ) values (
        target_comment_id,
        'ai',
        'primary-ai',
        next_routing_version,
        target_reply_id
      );
    end if;

    insert into public.comment_thread_participants (
      comment_id,
      participant_kind,
      participant_user_id,
      routing_version,
      changed_by_reply_id
    )
    select
      target_comment_id,
      'human',
      recipient_id,
      next_routing_version,
      target_reply_id
    from unnest(normalized_recipient_ids) recipient_id
    on conflict do nothing;

    if include_ai_participant then
      insert into public.comment_thread_participants (
        comment_id,
        participant_kind,
        participant_ai_key,
        routing_version,
        changed_by_reply_id
      ) values (
        target_comment_id,
        'ai',
        'primary-ai',
        next_routing_version,
        target_reply_id
      )
      on conflict do nothing;
    end if;
  else
    select max(routing_version) into next_routing_version
    from public.comment_thread_participants
    where comment_id = target_comment_id;

    if exists (
      select 1
      from public.comment_thread_participants participant
      where participant.comment_id = target_comment_id
        and participant.participant_kind = 'human'
        and not exists (
          select 1 from public.canvas_members membership
          where membership.canvas_id = target_comment.canvas_id
            and membership.user_id = participant.participant_user_id
        )
    ) then
      raise exception 'An addressed collaborator is no longer available; redirect this conversation.' using errcode = '42501';
    end if;

    if exists (
      select 1 from public.comment_thread_participants
      where comment_id = target_comment_id and participant_kind = 'ai'
    ) then
      effective_authority := private.effective_ai_authority(target_comment.canvas_id);
      if effective_authority is null then
        raise exception 'The primary AI is no longer available; redirect this conversation.' using errcode = '42501';
      end if;
    end if;
  end if;

  if next_routing_version is not null then
    insert into public.comment_message_recipients (
      comment_id,
      reply_id,
      recipient_kind,
      recipient_user_id,
      recipient_ai_key,
      routing_version,
      source
    )
    select
      target_comment_id,
      target_reply_id,
      participant.participant_kind,
      participant.participant_user_id,
      participant.participant_ai_key,
      next_routing_version,
      case when target_explicit
        then 'explicit'::public.comment_recipient_source
        else 'inherited'::public.comment_recipient_source
      end
    from public.comment_thread_participants participant
    where participant.comment_id = target_comment_id
      and not (
        target_author_kind = 'human'
        and participant.participant_kind = 'human'
        and participant.participant_user_id = actor_id
      )
      and not (
        target_author_kind = 'ai'
        and participant.participant_kind = 'ai'
        and participant.participant_ai_key = 'primary-ai'
      );
  end if;

  if target_author_kind = 'human' and exists (
    select 1
    from public.comment_message_recipients recipient
    where recipient.comment_id = target_comment_id
      and recipient.reply_id is not distinct from target_reply_id
      and recipient.recipient_kind = 'ai'
      and recipient.recipient_ai_key = 'primary-ai'
  ) then
    effective_authority := private.effective_ai_authority(target_comment.canvas_id);
    if effective_authority is null then
      raise exception 'The primary AI is not available to this participant.' using errcode = '42501';
    end if;
    insert into public.ai_runs (
      canvas_id,
      invoking_comment_id,
      invoking_reply_id,
      requested_by,
      idempotency_key,
      authority_snapshot,
      ordered_context_ids
    ) values (
      target_comment.canvas_id,
      target_comment_id,
      target_reply_id,
      actor_id,
      target_idempotency_key,
      effective_authority,
      coalesce(
        (
          select array_agg(target.target_object_id order by target.created_at, target.id)
          from public.comment_targets target
          where target.comment_id = target_comment_id
        ),
        array[]::uuid[]
      )
    )
    returning id into next_run_id;
  end if;

  return next_run_id;
end;
$$;

drop function public.create_comment_thread(
  uuid,
  uuid,
  text,
  uuid[],
  public.comment_prompt_kind,
  public.comment_author_kind,
  text,
  double precision,
  double precision
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
  object_target_count integer := cardinality(coalesce(target_object_ids, array[]::uuid[]));
  has_canvas_anchor boolean := target_anchor_x is not null and target_anchor_y is not null;
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
    select count(distinct target_id) from unnest(target_object_ids) target_id
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

  fingerprint := private.feedback_fingerprint(concat_ws(
    '|',
    target_canvas_id::text,
    target_body,
    coalesce(target_object_ids, array[]::uuid[])::text,
    coalesce(target_anchor_x::text, ''),
    coalesce(target_anchor_y::text, ''),
    coalesce(target_prompt_kind::text, ''),
    target_author_kind::text,
    normalized_author_key,
    normalized_recipient_ids::text,
    target_include_primary_ai::text,
    routing_explicit::text
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
    insert into public.comment_targets (comment_id, target_object_id)
    select next_comment_id, target_id from unnest(target_object_ids) target_id;
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

  if routing_explicit then
    next_run_id := private.apply_comment_routing(
      next_comment_id,
      null,
      target_author_kind,
      normalized_author_key,
      target_recipient_user_ids,
      target_include_primary_ai,
      true,
      target_client_command_id
    );
  end if;

  return query select next_comment_id, true, next_run_id;
end;
$$;

drop function public.create_comment_reply(uuid, uuid, text);

create function public.create_comment_reply(
  target_comment_id uuid,
  target_client_command_id uuid,
  target_body text,
  target_author_kind public.comment_author_kind default 'human',
  target_author_key text default null,
  target_recipient_user_ids uuid[] default null,
  target_include_primary_ai boolean default false
)
returns table (reply_id uuid, created boolean, ai_run_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_comment public.comments%rowtype;
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
  existing public.comment_replies%rowtype;
  next_reply_id uuid := extensions.gen_random_uuid();
  next_run_id uuid;
  routing_explicit boolean := target_recipient_user_ids is not null or target_include_primary_ai;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into target_comment
  from public.comments
  where id = target_comment_id
  for update;
  if not found then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;
  if not private.has_canvas_role(
    target_comment.canvas_id,
    array['owner', 'editor', 'commenter']::public.canvas_role[]
  ) then
    raise exception 'Reply creation is not permitted.' using errcode = '42501';
  end if;
  if target_comment.status <> 'open' then
    raise exception 'Closed comments are read-only.' using errcode = '22023';
  end if;
  if target_author_kind = 'ai' and not private.has_canvas_role(
    target_comment.canvas_id,
    array['owner', 'editor']::public.canvas_role[]
  ) then
    raise exception 'AI reply creation is not permitted.' using errcode = '42501';
  end if;
  if target_body is null or char_length(target_body) not between 1 and 100000 then
    raise exception 'Reply body is invalid.' using errcode = '22023';
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
    '|',
    target_comment_id::text,
    target_body,
    target_author_kind::text,
    normalized_author_key,
    normalized_recipient_ids::text,
    target_include_primary_ai::text,
    routing_explicit::text
  ));

  select * into existing
  from public.comment_replies
  where comment_id = target_comment_id
    and client_command_id = target_client_command_id;
  if found then
    if existing.command_fingerprint <> fingerprint then
      raise exception 'The reply command ID was reused with different content.' using errcode = '23505';
    end if;
    select id into next_run_id from public.ai_runs
    where canvas_id = target_comment.canvas_id
      and idempotency_key = target_client_command_id;
    return query select existing.id, false, next_run_id;
    return;
  end if;

  insert into public.comment_replies (
    id,
    comment_id,
    author_id,
    author_kind,
    author_key,
    client_command_id,
    command_fingerprint,
    body
  ) values (
    next_reply_id,
    target_comment_id,
    actor_id,
    target_author_kind,
    normalized_author_key,
    target_client_command_id,
    fingerprint,
    target_body
  );

  next_run_id := private.apply_comment_routing(
    target_comment_id,
    next_reply_id,
    target_author_kind,
    normalized_author_key,
    target_recipient_user_ids,
    target_include_primary_ai,
    routing_explicit,
    target_client_command_id
  );

  return query select next_reply_id, true, next_run_id;
end;
$$;

create function public.complete_fake_ai_run(
  target_run_id uuid,
  target_body text,
  target_provider_request_id text,
  target_projection_metadata jsonb
)
returns table (run_id uuid, reply_id uuid, status public.ai_run_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_run public.ai_runs%rowtype;
  target_comment public.comments%rowtype;
  next_reply_id uuid := extensions.gen_random_uuid();
  current_authority public.ai_authority_level;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if target_body is null or char_length(target_body) not between 1 and 100000 then
    raise exception 'AI reply body is invalid.' using errcode = '22023';
  end if;
  if target_provider_request_id is null or char_length(target_provider_request_id) not between 1 and 255 then
    raise exception 'Provider request identity is invalid.' using errcode = '22023';
  end if;
  if target_projection_metadata is null or jsonb_typeof(target_projection_metadata) <> 'object' then
    raise exception 'Projection metadata is invalid.' using errcode = '22023';
  end if;

  select * into target_run
  from public.ai_runs
  where id = target_run_id
  for update;
  if not found then
    raise exception 'AI run not found.' using errcode = 'P0002';
  end if;
  if target_run.requested_by <> actor_id then
    raise exception 'Only the requesting participant can complete this AI run.' using errcode = '42501';
  end if;
  if target_run.status = 'completed' and target_run.output_reply_id is not null then
    return query select target_run.id, target_run.output_reply_id, target_run.status;
    return;
  end if;
  if target_run.status not in ('queued', 'projecting', 'thinking') then
    raise exception 'AI run is not available for completion.' using errcode = '22023';
  end if;

  select * into target_comment
  from public.comments
  where id = target_run.invoking_comment_id
    and canvas_id = target_run.canvas_id
  for update;
  if not found or target_comment.status <> 'open' then
    raise exception 'The invoking comment is no longer open.' using errcode = '22023';
  end if;
  if target_run.invoking_reply_id is not null and not exists (
    select 1 from public.comment_replies reply
    where reply.id = target_run.invoking_reply_id
      and reply.comment_id = target_comment.id
  ) then
    raise exception 'The invoking reply is no longer available.' using errcode = '22023';
  end if;
  if not private.has_canvas_role(
    target_run.canvas_id,
    array['owner', 'editor', 'commenter']::public.canvas_role[]
  ) then
    raise exception 'Canvas access is no longer permitted.' using errcode = '42501';
  end if;
  current_authority := private.effective_ai_authority(target_run.canvas_id);
  if current_authority is null then
    raise exception 'The primary AI is no longer available.' using errcode = '42501';
  end if;

  insert into public.comment_replies (
    id, comment_id, author_id, author_kind, author_key,
    client_command_id, command_fingerprint, body
  ) values (
    next_reply_id,
    target_comment.id,
    actor_id,
    'ai',
    'primary-ai',
    target_run.id,
    private.feedback_fingerprint(concat_ws(
      '|', target_comment.id::text, target_run.id::text, target_body, 'primary-ai'
    )),
    target_body
  );

  perform private.apply_comment_routing(
    target_comment.id,
    next_reply_id,
    'ai',
    'primary-ai',
    null,
    false,
    false,
    target_run.id
  );

  update public.ai_runs run
  set output_comment_id = target_comment.id,
      output_reply_id = next_reply_id,
      provider_request_id = target_provider_request_id,
      model = 'deterministic-fake',
      authority_snapshot = current_authority,
      projection_metadata = target_projection_metadata,
      status = 'completed',
      updated_at = now()
  where run.id = target_run.id;

  return query select target_run.id, next_reply_id, 'completed'::public.ai_run_status;
end;
$$;

create function public.start_ai_run(target_run_id uuid)
returns table (run_id uuid, status public.ai_run_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_run public.ai_runs%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into target_run from public.ai_runs where id = target_run_id for update;
  if not found or target_run.requested_by <> actor_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;
  if target_run.status = 'queued' then
    update public.ai_runs
    set status = 'projecting', updated_at = now()
    where id = target_run.id;
    target_run.status := 'projecting';
  elsif target_run.status not in ('projecting', 'thinking') then
    raise exception 'AI run cannot be started.' using errcode = '22023';
  end if;
  return query select target_run.id, target_run.status;
end;
$$;

create function public.cancel_ai_run(target_run_id uuid)
returns table (run_id uuid, status public.ai_run_status, cancelled_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_run public.ai_runs%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into target_run from public.ai_runs where id = target_run_id for update;
  if not found or target_run.requested_by <> actor_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;
  if target_run.status in ('completed', 'failed') then
    raise exception 'A finished AI run cannot be cancelled.' using errcode = '22023';
  end if;
  if target_run.status <> 'cancelled' then
    target_run.cancelled_at := now();
    update public.ai_runs
    set status = 'cancelled',
        cancelled_at = target_run.cancelled_at,
        error_code = 'cancelled_by_user',
        updated_at = now()
    where id = target_run.id;
  end if;
  return query select target_run.id, 'cancelled'::public.ai_run_status, target_run.cancelled_at;
end;
$$;

create function public.fail_ai_run(target_run_id uuid, target_error_code text)
returns table (run_id uuid, status public.ai_run_status, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_run public.ai_runs%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if target_error_code is null or char_length(target_error_code) not between 1 and 120 then
    raise exception 'AI failure code is invalid.' using errcode = '22023';
  end if;
  select * into target_run from public.ai_runs where id = target_run_id for update;
  if not found or target_run.requested_by <> actor_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;
  if target_run.status = 'cancelled' then
    return query select target_run.id, target_run.status, target_run.error_code;
    return;
  end if;
  if target_run.status = 'completed' then
    raise exception 'A completed AI run cannot fail.' using errcode = '22023';
  end if;
  update public.ai_runs
  set status = 'failed', error_code = target_error_code, updated_at = now()
  where id = target_run.id;
  return query select target_run.id, 'failed'::public.ai_run_status, target_error_code;
end;
$$;

create function public.retry_ai_run(target_run_id uuid, target_idempotency_key uuid)
returns table (run_id uuid, status public.ai_run_status, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_run public.ai_runs%rowtype;
  existing public.ai_runs%rowtype;
  next_run_id uuid := extensions.gen_random_uuid();
  current_authority public.ai_authority_level;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into target_run from public.ai_runs where id = target_run_id for update;
  if not found or target_run.requested_by <> actor_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;
  if target_run.status not in ('cancelled', 'failed') then
    raise exception 'Only a cancelled or failed AI run can be retried.' using errcode = '22023';
  end if;
  if target_run.invoking_comment_id is null or not exists (
    select 1 from public.comments comment
    where comment.id = target_run.invoking_comment_id
      and comment.canvas_id = target_run.canvas_id
      and comment.status = 'open'
  ) then
    raise exception 'The invoking comment is no longer open.' using errcode = '22023';
  end if;
  current_authority := private.effective_ai_authority(target_run.canvas_id);
  if current_authority is null then
    raise exception 'The primary AI is no longer available.' using errcode = '42501';
  end if;
  select * into existing from public.ai_runs
  where canvas_id = target_run.canvas_id and idempotency_key = target_idempotency_key;
  if found then
    if existing.requested_by <> actor_id
      or existing.invoking_comment_id is distinct from target_run.invoking_comment_id
      or existing.invoking_reply_id is distinct from target_run.invoking_reply_id then
      raise exception 'The retry command ID was reused for another run.' using errcode = '23505';
    end if;
    return query select existing.id, existing.status, false;
    return;
  end if;
  insert into public.ai_runs (
    id, canvas_id, invoking_comment_id, invoking_reply_id,
    requested_by, idempotency_key, authority_snapshot, ordered_context_ids
  ) values (
    next_run_id, target_run.canvas_id, target_run.invoking_comment_id,
    target_run.invoking_reply_id, actor_id, target_idempotency_key,
    current_authority, target_run.ordered_context_ids
  );
  return query select next_run_id, 'queued'::public.ai_run_status, true;
end;
$$;

create function private.cancel_comment_ai_runs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_error_code text := case
    when tg_op = 'DELETE' then 'source_thread_deleted'
    else 'source_thread_closed'
  end;
begin
  if tg_op = 'DELETE' or (old.status = 'open' and new.status <> 'open') then
    if tg_op = 'DELETE' then
      update public.ai_runs
      set projection_metadata = projection_metadata - 'evidence',
          updated_at = now()
      where invoking_comment_id = old.id;
    end if;
    update public.ai_runs
    set status = 'cancelled',
        cancelled_at = now(),
        error_code = next_error_code,
        updated_at = now()
    where invoking_comment_id = old.id
      and status in ('queued', 'projecting', 'thinking', 'tool_pending', 'applying');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger comments_cancel_ai_runs_on_close
  before update of status or delete on public.comments
  for each row execute function private.cancel_comment_ai_runs();

alter table public.canvas_ai_settings enable row level security;
alter table public.comment_thread_participants enable row level security;
alter table public.comment_message_recipients enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_tool_executions enable row level security;
alter table public.ai_rate_limit_windows enable row level security;

create policy canvas_ai_settings_select
on public.canvas_ai_settings
for select
to authenticated
using (private.canvas_role(canvas_id) is not null);

create policy comment_thread_participants_select
on public.comment_thread_participants
for select
to authenticated
using (private.canvas_role(private.comment_canvas(comment_id)) is not null);

create policy comment_message_recipients_select
on public.comment_message_recipients
for select
to authenticated
using (private.canvas_role(private.comment_canvas(comment_id)) is not null);

create policy ai_runs_select
on public.ai_runs
for select
to authenticated
using (private.canvas_role(canvas_id) is not null);

create policy ai_tool_executions_select
on public.ai_tool_executions
for select
to authenticated
using (private.canvas_role(private.ai_run_canvas(run_id)) is not null);

create policy ai_rate_limit_windows_owner_select
on public.ai_rate_limit_windows
for select
to authenticated
using (private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]));

revoke all on table public.canvas_ai_settings from public, anon, authenticated;
revoke all on table public.comment_thread_participants from public, anon, authenticated;
revoke all on table public.comment_message_recipients from public, anon, authenticated;
revoke all on table public.ai_runs from public, anon, authenticated;
revoke all on table public.ai_tool_executions from public, anon, authenticated;
revoke all on table public.ai_rate_limit_windows from public, anon, authenticated;

grant select on table public.canvas_ai_settings to authenticated;
grant select on table public.comment_thread_participants to authenticated;
grant select on table public.comment_message_recipients to authenticated;
grant select on table public.ai_runs to authenticated;
grant select on table public.ai_tool_executions to authenticated;
grant select on table public.ai_rate_limit_windows to authenticated;

revoke all on function public.set_canvas_ai_settings(
  uuid, boolean, public.ai_authority_level, bigint
) from public, anon;
revoke all on function public.get_canvas_ai_access(uuid) from public, anon;
revoke all on function public.create_comment_thread(
  uuid,
  uuid,
  text,
  uuid[],
  public.comment_prompt_kind,
  public.comment_author_kind,
  text,
  double precision,
  double precision,
  uuid[],
  boolean
) from public, anon;
revoke all on function public.create_comment_reply(
  uuid,
  uuid,
  text,
  public.comment_author_kind,
  text,
  uuid[],
  boolean
) from public, anon;
revoke all on function public.complete_fake_ai_run(uuid, text, text, jsonb)
  from public, anon;
revoke all on function public.start_ai_run(uuid) from public, anon;
revoke all on function public.cancel_ai_run(uuid) from public, anon;
revoke all on function public.fail_ai_run(uuid, text) from public, anon;
revoke all on function public.retry_ai_run(uuid, uuid) from public, anon;

grant execute on function public.set_canvas_ai_settings(
  uuid, boolean, public.ai_authority_level, bigint
) to authenticated;
grant execute on function public.get_canvas_ai_access(uuid) to authenticated;
grant execute on function public.create_comment_thread(
  uuid,
  uuid,
  text,
  uuid[],
  public.comment_prompt_kind,
  public.comment_author_kind,
  text,
  double precision,
  double precision,
  uuid[],
  boolean
) to authenticated;
grant execute on function public.create_comment_reply(
  uuid,
  uuid,
  text,
  public.comment_author_kind,
  text,
  uuid[],
  boolean
) to authenticated;
grant execute on function public.complete_fake_ai_run(uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.start_ai_run(uuid) to authenticated;
grant execute on function public.cancel_ai_run(uuid) to authenticated;
grant execute on function public.fail_ai_run(uuid, text) to authenticated;
grant execute on function public.retry_ai_run(uuid, uuid) to authenticated;
