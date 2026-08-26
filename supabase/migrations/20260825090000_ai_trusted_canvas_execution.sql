create function public.execute_ai_canvas_commands(
  target_run_id uuid,
  target_requester_id uuid,
  target_call_key text,
  target_command_id uuid,
  target_update_data bytea,
  target_affected_object_ids uuid[],
  target_expected_sequence bigint
)
returns table (
  tool_execution_id uuid,
  sequence bigint,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.ai_runs%rowtype;
  target_source_comment public.comments%rowtype;
  existing_execution public.ai_tool_executions%rowtype;
  existing_update public.canvas_updates%rowtype;
  next_execution_id uuid := extensions.gen_random_uuid();
  next_sequence bigint;
  actor_role public.canvas_role;
  current_authority public.ai_authority_level;
  affected_count integer := cardinality(coalesce(target_affected_object_ids, array[]::uuid[]));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_requester_id is null or target_command_id is null then
    raise exception 'An accountable requester and command identity are required.' using errcode = '22023';
  end if;
  if target_call_key is null or char_length(target_call_key) not between 1 and 255 then
    raise exception 'Tool call identity is invalid.' using errcode = '22023';
  end if;
  if target_update_data is null or octet_length(target_update_data) = 0 then
    raise exception 'Canvas update data is invalid.' using errcode = '22023';
  end if;
  if affected_count not between 1 and 1000 then
    raise exception 'Trusted execution requires between 1 and 1000 affected object identities.' using errcode = '22023';
  end if;
  if (
    select count(distinct object_id)
    from unnest(coalesce(target_affected_object_ids, array[]::uuid[])) object_id
  ) <> affected_count then
    raise exception 'Affected object identities must be unique.' using errcode = '22023';
  end if;
  if target_expected_sequence is null or target_expected_sequence < 0 then
    raise exception 'Projection sequence is invalid.' using errcode = '22023';
  end if;

  select * into target_run
  from public.ai_runs
  where id = target_run_id
  for update;
  if not found or target_run.requested_by <> target_requester_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;

  select * into existing_execution
  from public.ai_tool_executions execution
  where execution.run_id = target_run.id and execution.call_key = target_call_key;
  if found then
    select * into existing_update
    from public.canvas_updates canvas_update
    where canvas_update.canvas_id = target_run.canvas_id
      and canvas_update.actor_id = target_requester_id
      and canvas_update.client_update_id = target_command_id;
    if existing_execution.tool_name <> 'execute_canvas_commands'
      or existing_execution.affected_object_ids <> target_affected_object_ids
      or existing_execution.outcome <> 'succeeded'
      or existing_execution.command_id <> target_command_id
      or existing_execution.comment_id is not null
      or existing_execution.change_set_id is not null
      or existing_update.sequence is null
      or existing_update.update_data <> target_update_data then
      raise exception 'The tool call identity was reused with different or incomplete work.' using errcode = '23505';
    end if;
    return query select existing_execution.id, existing_update.sequence, false;
    return;
  end if;

  if target_run.status not in ('projecting', 'thinking', 'tool_pending', 'applying') then
    raise exception 'AI run is not available for trusted execution.' using errcode = '22023';
  end if;
  select * into target_source_comment
  from public.comments
  where id = target_run.invoking_comment_id
    and canvas_id = target_run.canvas_id
  for update;
  if not found or target_source_comment.status <> 'open' then
    raise exception 'The invoking comment is no longer open.' using errcode = '22023';
  end if;

  select membership.role,
    case
      when settings.enabled and membership.role in ('owner', 'editor') then settings.authority
      else null
    end
  into actor_role, current_authority
  from public.canvas_members membership
  join public.canvas_ai_settings settings on settings.canvas_id = membership.canvas_id
  where membership.canvas_id = target_run.canvas_id
    and membership.user_id = target_requester_id;
  if actor_role is null or actor_role not in ('owner', 'editor') then
    raise exception 'Canvas trusted-edit access is no longer permitted.' using errcode = '42501';
  end if;
  if current_authority <> 'trusted_editor' then
    raise exception 'Current AI authority does not allow canonical canvas changes.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_run.canvas_id::text, 0));
  select greatest(
    coalesce((select max(snapshot.last_sequence) from public.canvas_snapshots snapshot where snapshot.canvas_id = target_run.canvas_id), 0),
    coalesce((select max(canvas_update.sequence) from public.canvas_updates canvas_update where canvas_update.canvas_id = target_run.canvas_id), 0)
  ) into next_sequence;
  if next_sequence <> target_expected_sequence then
    raise exception 'The canvas changed after the AI projection was built.' using errcode = '40001';
  end if;
  next_sequence := next_sequence + 1;

  insert into public.canvas_updates (
    canvas_id, sequence, update_data, actor_id, client_update_id
  ) values (
    target_run.canvas_id, next_sequence, target_update_data,
    target_requester_id, target_command_id
  );

  insert into public.ai_tool_executions (
    id, run_id, call_key, tool_name, affected_object_ids, outcome, command_id
  ) values (
    next_execution_id, target_run.id, target_call_key,
    'execute_canvas_commands', target_affected_object_ids, 'succeeded', target_command_id
  );

  update public.ai_runs
  set status = 'applying', authority_snapshot = current_authority, updated_at = now()
  where id = target_run.id;

  return query select next_execution_id, next_sequence, true;
end;
$$;

create function public.get_ai_canvas_execution_retry(
  target_run_id uuid,
  target_requester_id uuid,
  target_call_key text,
  target_command_id uuid
)
returns table (
  sequence bigint,
  update_data bytea,
  affected_object_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.ai_runs%rowtype;
  existing_execution public.ai_tool_executions%rowtype;
  existing_update public.canvas_updates%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_requester_id is null or target_command_id is null
    or target_call_key is null or char_length(target_call_key) not between 1 and 255 then
    raise exception 'Trusted retry identity is invalid.' using errcode = '22023';
  end if;

  select * into target_run
  from public.ai_runs
  where id = target_run_id;
  if not found or target_run.requested_by <> target_requester_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;
  select * into existing_execution
  from public.ai_tool_executions execution
  where execution.run_id = target_run.id and execution.call_key = target_call_key;
  if not found then
    return;
  end if;
  select * into existing_update
  from public.canvas_updates canvas_update
  where canvas_update.canvas_id = target_run.canvas_id
    and canvas_update.actor_id = target_requester_id
    and canvas_update.client_update_id = target_command_id;
  if existing_execution.tool_name <> 'execute_canvas_commands'
    or existing_execution.outcome <> 'succeeded'
    or existing_execution.command_id <> target_command_id
    or existing_execution.comment_id is not null
    or existing_execution.change_set_id is not null
    or existing_update.sequence is null then
    raise exception 'The trusted tool call identity conflicts with existing work.' using errcode = '23505';
  end if;
  return query select
    existing_update.sequence,
    existing_update.update_data,
    existing_execution.affected_object_ids;
end;
$$;

create or replace function public.complete_fake_ai_run(
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
  if target_run.status not in ('queued', 'projecting', 'thinking', 'tool_pending', 'applying') then
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
    next_reply_id, target_comment.id, actor_id, 'ai', 'primary-ai', target_run.id,
    private.feedback_fingerprint(concat_ws(
      '|', target_comment.id::text, target_run.id::text, target_body, 'primary-ai'
    )), target_body
  );

  perform private.apply_comment_routing(
    target_comment.id, next_reply_id, 'ai', 'primary-ai', null,
    false, false, null, target_run.id
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

revoke all on function public.execute_ai_canvas_commands(
  uuid, uuid, text, uuid, bytea, uuid[], bigint
) from public, anon, authenticated;

grant execute on function public.execute_ai_canvas_commands(
  uuid, uuid, text, uuid, bytea, uuid[], bigint
) to service_role;

revoke all on function public.get_ai_canvas_execution_retry(
  uuid, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.get_ai_canvas_execution_retry(
  uuid, uuid, text, uuid
) to service_role;
