-- Recheck voice authorization both when staging and when publishing its update.
create function private.assert_voice_run_active(target_run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare task public.voice_delegations; session public.voice_test_sessions;
begin
  select delegation.* into task
  from public.voice_delegations delegation
  join public.ai_runs run on run.idempotency_key = delegation.id
  where run.id = target_run_id;
  if not found then return; end if;
  select * into session from public.voice_test_sessions where id = task.session_id for update;
  select * into task from public.voice_delegations where id = task.id for update;
  if task.ai_run_id is distinct from target_run_id or task.status <> 'running'
    or task.finished_at is not null or task.reserved_units <= 0
    or session.ended_at is not null or session.close_requested_at is not null
    or session.provider_closed_at is not null or session.expires_at <= clock_timestamp()
    or not session.supervisor_ready or session.heartbeat_at is null
    or session.heartbeat_at < clock_timestamp() - interval '30 seconds'
    or session.backend_cancel_at >= task.created_at
    or not public.voice_test_has_access(session.id)
 then
    raise exception 'Voice task no longer permits this action' using errcode = '42501';
  end if;
  return;
end;
$$;
revoke all on function private.assert_voice_run_active(uuid) from public, anon, authenticated;

create or replace function private.guard_voice_tool_execution()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_voice_run_active(new.run_id);
  if exists (select 1 from public.voice_delegations where ai_run_id = new.run_id)
    and new.tool_name not in ('create_contextual_comment', 'execute_canvas_commands', 'stage_canvas_changes') then
    raise exception 'Voice task no longer permits this action' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function private.guard_voice_review_activation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_voice_run_active(new.ai_run_id);
  return new;
end;
$$;
revoke all on function private.guard_voice_review_activation() from public, anon, authenticated;
create trigger guard_voice_review_activation
before update of activation_sequence on public.ai_change_sets
for each row when (old.activation_sequence is null and new.activation_sequence is not null)
execute function private.guard_voice_review_activation();
