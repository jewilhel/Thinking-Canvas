create function public.record_ai_canvas_proposal(
  target_run_id uuid,
  target_requester_id uuid,
  target_call_key text,
  target_affected_object_ids uuid[],
  target_expected_sequence bigint
)
returns table (tool_execution_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.ai_runs%rowtype;
  target_source_comment public.comments%rowtype;
  existing_execution public.ai_tool_executions%rowtype;
  next_execution_id uuid := extensions.gen_random_uuid();
  actor_role public.canvas_role;
  current_authority public.ai_authority_level;
  current_sequence bigint;
  affected_count integer := cardinality(coalesce(target_affected_object_ids, array[]::uuid[]));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_requester_id is null then
    raise exception 'An accountable requester is required.' using errcode = '22023';
  end if;
  if target_call_key is null or char_length(target_call_key) not between 1 and 255 then
    raise exception 'Tool call identity is invalid.' using errcode = '22023';
  end if;
  if affected_count not between 1 and 1000 then
    raise exception 'A proposal requires between 1 and 1000 affected object identities.' using errcode = '22023';
  end if;
  if (
    select count(distinct object_id)
    from unnest(coalesce(target_affected_object_ids, array[]::uuid[])) object_id
  ) <> affected_count then
    raise exception 'Proposal object identities must be unique.' using errcode = '22023';
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
  from public.ai_tool_executions
  where run_id = target_run.id and call_key = target_call_key;
  if found then
    if existing_execution.tool_name <> 'propose_canvas_commands'
      or existing_execution.affected_object_ids <> target_affected_object_ids
      or existing_execution.outcome <> 'succeeded'
      or existing_execution.command_id is not null
      or existing_execution.comment_id is not null
      or existing_execution.change_set_id is not null then
      raise exception 'The tool call identity was reused with different or mutating work.' using errcode = '23505';
    end if;
    return query select existing_execution.id, false;
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
    and membership.user_id = target_requester_id;
  if actor_role is null or actor_role not in ('owner', 'editor') then
    raise exception 'Canvas proposal access is no longer permitted.' using errcode = '42501';
  end if;
  if current_authority not in ('propose_changes', 'edit_with_review', 'trusted_editor') then
    raise exception 'Current AI authority does not allow proposals.' using errcode = '42501';
  end if;

  select greatest(
    coalesce((select max(snapshot.last_sequence) from public.canvas_snapshots snapshot where snapshot.canvas_id = target_run.canvas_id), 0),
    coalesce((select max(canvas_update.sequence) from public.canvas_updates canvas_update where canvas_update.canvas_id = target_run.canvas_id), 0)
  ) into current_sequence;
  if current_sequence <> target_expected_sequence then
    raise exception 'The canvas changed after the AI projection was built.' using errcode = '40001';
  end if;

  insert into public.ai_tool_executions (
    id, run_id, call_key, tool_name, affected_object_ids, outcome
  ) values (
    next_execution_id, target_run.id, target_call_key,
    'propose_canvas_commands', target_affected_object_ids, 'succeeded'
  );

  update public.ai_runs
  set status = 'tool_pending', authority_snapshot = current_authority, updated_at = now()
  where id = target_run.id;

  return query select next_execution_id, true;
end;
$$;

revoke all on function public.record_ai_canvas_proposal(
  uuid, uuid, text, uuid[], bigint
) from public, anon, authenticated;

grant execute on function public.record_ai_canvas_proposal(
  uuid, uuid, text, uuid[], bigint
) to service_role;
