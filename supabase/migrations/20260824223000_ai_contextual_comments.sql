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
  if target_run.status not in ('queued', 'projecting', 'thinking', 'tool_pending') then
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
    null,
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

create function public.execute_ai_contextual_comment(
  target_run_id uuid,
  target_requester_id uuid,
  target_call_key text,
  target_body text,
  target_object_ids uuid[],
  target_expected_sequence bigint
)
returns table (tool_execution_id uuid, comment_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := target_requester_id;
  target_run public.ai_runs%rowtype;
  target_source_comment public.comments%rowtype;
  existing_execution public.ai_tool_executions%rowtype;
  next_execution_id uuid := extensions.gen_random_uuid();
  next_comment_id uuid := extensions.gen_random_uuid();
  next_command_id uuid := extensions.gen_random_uuid();
  actor_role public.canvas_role;
  current_authority public.ai_authority_level;
  current_sequence bigint;
  object_target_count integer := cardinality(coalesce(target_object_ids, array[]::uuid[]));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if actor_id is null then
    raise exception 'An accountable requester is required.' using errcode = '22023';
  end if;
  if target_call_key is null or char_length(target_call_key) not between 1 and 255 then
    raise exception 'Tool call identity is invalid.' using errcode = '22023';
  end if;
  if target_body is null or char_length(target_body) not between 1 and 100000 then
    raise exception 'Contextual comment body is invalid.' using errcode = '22023';
  end if;
  if object_target_count not between 1 and 100 then
    raise exception 'A contextual comment requires between 1 and 100 object targets.' using errcode = '22023';
  end if;
  if (
    select count(distinct target_id)
    from unnest(coalesce(target_object_ids, array[]::uuid[])) target_id
  ) <> object_target_count then
    raise exception 'Contextual comment targets must be unique.' using errcode = '22023';
  end if;
  if target_expected_sequence is null or target_expected_sequence < 0 then
    raise exception 'Projection sequence is invalid.' using errcode = '22023';
  end if;

  select * into target_run
  from public.ai_runs
  where id = target_run_id
  for update;
  if not found or target_run.requested_by <> actor_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;

  select * into existing_execution
  from public.ai_tool_executions
  where run_id = target_run.id and call_key = target_call_key;
  if found then
    if existing_execution.tool_name <> 'create_contextual_comment'
      or existing_execution.affected_object_ids <> target_object_ids
      or existing_execution.outcome <> 'succeeded'
      or existing_execution.comment_id is null then
      raise exception 'The tool call identity was reused with different or incomplete work.' using errcode = '23505';
    end if;
    return query select existing_execution.id, existing_execution.comment_id, false;
    return;
  end if;

  if target_run.status not in ('projecting', 'thinking', 'tool_pending') then
    raise exception 'AI run is not available for tool execution.' using errcode = '22023';
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
      when not settings.enabled then null
      when membership.role in ('owner', 'editor') then settings.authority
      when membership.role = 'commenter' then 'comment_only'::public.ai_authority_level
      else null
    end
  into actor_role, current_authority
  from public.canvas_members membership
  join public.canvas_ai_settings settings on settings.canvas_id = membership.canvas_id
  where membership.canvas_id = target_run.canvas_id
    and membership.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'editor', 'commenter') then
    raise exception 'Canvas access is no longer permitted.' using errcode = '42501';
  end if;
  if current_authority is null then
    raise exception 'The primary AI is no longer available.' using errcode = '42501';
  end if;

  select greatest(
    coalesce((select max(snapshot.last_sequence) from public.canvas_snapshots snapshot where snapshot.canvas_id = target_run.canvas_id), 0),
    coalesce((select max(canvas_update.sequence) from public.canvas_updates canvas_update where canvas_update.canvas_id = target_run.canvas_id), 0)
  ) into current_sequence;
  if current_sequence <> target_expected_sequence then
    raise exception 'The canvas changed after the AI projection was built.' using errcode = '40001';
  end if;

  insert into public.ai_tool_executions (
    id, run_id, call_key, tool_name, affected_object_ids, outcome, command_id
  ) values (
    next_execution_id, target_run.id, target_call_key,
    'create_contextual_comment', target_object_ids, 'pending', next_command_id
  );

  insert into public.comments (
    id, canvas_id, author_id, author_kind, author_key,
    client_command_id, command_fingerprint, body
  ) values (
    next_comment_id,
    target_run.canvas_id,
    actor_id,
    'ai',
    'primary-ai',
    next_command_id,
    private.feedback_fingerprint(concat_ws(
      '|', target_run.canvas_id::text, target_run.id::text, target_call_key,
      target_body, target_object_ids::text, 'primary-ai'
    )),
    target_body
  );

  insert into public.comment_targets (comment_id, target_object_id, target_order)
  select next_comment_id, target_id, target_order - 1
  from unnest(target_object_ids) with ordinality target(target_id, target_order);

  insert into public.comment_thread_participants (
    comment_id, participant_kind, participant_ai_key, routing_version
  ) values (
    next_comment_id, 'ai', 'primary-ai', 1
  );

  insert into public.comment_thread_participants (
    comment_id, participant_kind, participant_user_id, routing_version
  ) values (
    next_comment_id, 'human', actor_id, 1
  );

  insert into public.comment_message_recipients (
    comment_id, recipient_kind, recipient_user_id, routing_version, source
  ) values (
    next_comment_id, 'human', actor_id, 1, 'explicit'
  );

  update public.ai_tool_executions
  set outcome = 'succeeded', comment_id = next_comment_id, updated_at = now()
  where id = next_execution_id;

  update public.ai_runs
  set status = 'tool_pending', authority_snapshot = current_authority, updated_at = now()
  where id = target_run.id;

  return query select next_execution_id, next_comment_id, true;
end;
$$;

revoke all on function public.execute_ai_contextual_comment(
  uuid, uuid, text, text, uuid[], bigint
) from public, anon, authenticated;

grant execute on function public.execute_ai_contextual_comment(
  uuid, uuid, text, text, uuid[], bigint
) to service_role;
