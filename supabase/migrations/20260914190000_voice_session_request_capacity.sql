-- Voice tasks are bounded by active-session time and metered allowance, not a lifetime request count.
create or replace function public.reserve_voice_delegation(target_session uuid,target_delegation text)
returns public.voice_delegations language plpgsql security definer set search_path='' as $$
declare s public.voice_test_sessions; result public.voice_delegations;
begin
  select * into s from public.voice_test_sessions where id=target_session for update;
  if not found or s.api_kind<>'live' or s.ended_at is not null or s.close_requested_at is not null or s.provider_closed_at is not null
    or not s.supervisor_ready or s.heartbeat_at is null or s.expires_at <= now() or s.heartbeat_at < now()-interval '30 seconds' or not public.voice_test_has_access(target_session) then raise exception 'Voice task access denied' using errcode='42501'; end if;
  if exists(select 1 from public.voice_delegations where session_id=target_session and delegation_id=target_delegation) then return null; end if;
  if s.backend_reserved_units>0 then raise exception 'A voice task is already running'; end if;
  -- One bounded Responses request: $1 reservation plus voice deadline/headroom.
  if s.backend_charged_units+1200000+660000 > s.reserved_cents::bigint*s.units_per_cent then raise exception 'Shared voice allowance unavailable'; end if;
  insert into public.voice_delegations(session_id,delegation_id) values(target_session,target_delegation) returning * into result;
  update public.voice_test_sessions set backend_reserved_units=backend_reserved_units+result.reserved_units where id=target_session;
  return result;
end $$;
