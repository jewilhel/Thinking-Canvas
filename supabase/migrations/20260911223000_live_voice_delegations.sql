-- Operational task linkage only; conversation fragments remain volatile.
alter table public.voice_test_sessions
  add column backend_reserved_units bigint not null default 0 check (backend_reserved_units >= 0),
  add column backend_charged_units bigint not null default 0 check (backend_charged_units >= 0),
  add column backend_usage_final boolean not null default true,
  add column backend_cancel_at timestamptz,
  add column describe_requested_at timestamptz,
  add column provider_closed_at timestamptz;
create table public.voice_delegations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.voice_test_sessions(id),
  delegation_id text not null check (length(delegation_id) between 1 and 512),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
  reserved_units bigint not null default 1200000,
  charged_units bigint,
  usage_final boolean not null default false,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  model text,
  input_tokens integer,
  output_tokens integer,
  unique(session_id,delegation_id)
);
alter table public.voice_delegations enable row level security;
revoke all on public.voice_delegations from anon,authenticated;
grant all on public.voice_delegations to service_role;
create function public.reserve_voice_delegation(target_session uuid,target_delegation text)
returns public.voice_delegations language plpgsql security definer set search_path='' as $$
declare s public.voice_test_sessions; result public.voice_delegations;
begin
  select * into s from public.voice_test_sessions where id=target_session for update;
  if not found or s.api_kind<>'live' or s.ended_at is not null or s.close_requested_at is not null or s.provider_closed_at is not null
    or not s.supervisor_ready or s.heartbeat_at is null or s.expires_at <= now() or s.heartbeat_at < now()-interval '30 seconds' or not public.voice_test_has_access(target_session) then raise exception 'Voice task access denied' using errcode='42501'; end if;
  if exists(select 1 from public.voice_delegations where session_id=target_session and delegation_id=target_delegation) then return null; end if;
  if s.backend_reserved_units>0 or (select count(*) from public.voice_delegations where session_id=target_session)>=4 then raise exception 'Voice task limit reached'; end if;
  -- One bounded Responses request: $1 reservation plus voice deadline/headroom.
  if s.backend_charged_units+1200000+660000 > s.reserved_cents::bigint*s.units_per_cent then raise exception 'Shared voice allowance unavailable'; end if;
  insert into public.voice_delegations(session_id,delegation_id) values(target_session,target_delegation) returning * into result;
  update public.voice_test_sessions set backend_reserved_units=backend_reserved_units+result.reserved_units where id=target_session;
  return result;
end $$;
create or replace function public.finish_live_voice_test(target_id uuid, target_reason text, target_rejected boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare session public.voice_test_sessions; charge integer;
begin
  select * into session from public.voice_test_sessions where id=target_id for update;
  if not found or session.ended_at is not null then return; end if;
  if session.api_kind <> 'live' then raise exception 'Not a Live session'; end if;
  if session.backend_reserved_units>0 then return; end if;
  if target_rejected and session.call_id is not null then raise exception 'Created sessions are not rejected handshakes'; end if;
  if session.voice_usage_units+session.backend_charged_units > session.reserved_cents::bigint*session.units_per_cent then raise exception 'Usage exceeds reservation; reconciliation required'; end if;
  charge := case when target_rejected then 0
    when session.voice_usage_final then ceil((greatest(15000,session.voice_usage_units)+session.backend_charged_units)::numeric/session.units_per_cent)::integer
    else session.reserved_cents end;
  perform public.finish_voice_test(target_id,charge,target_reason);
end $$;
create function public.finish_voice_delegation(target_id uuid,target_status text,target_units bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare task public.voice_delegations; s public.voice_test_sessions; amount bigint;
begin
  select * into task from public.voice_delegations where id=target_id;
  if not found then return; end if;
  select * into s from public.voice_test_sessions where id=task.session_id for update;
  select * into task from public.voice_delegations where id=target_id for update;
  if task.finished_at is not null then return; end if;
  if target_status not in ('completed','failed','cancelled') then raise exception 'Invalid voice task status'; end if;
  amount := coalesce(target_units,task.reserved_units);
  if amount<0 or amount>task.reserved_units then raise exception 'Voice task usage outside reservation'; end if;
  update public.voice_delegations set status=target_status,finished_at=now(),charged_units=amount,usage_final=target_units is not null where id=target_id;
  update public.voice_test_sessions set backend_reserved_units=backend_reserved_units-task.reserved_units,
    backend_charged_units=backend_charged_units+amount,backend_usage_final=backend_usage_final and target_units is not null where id=task.session_id;
  if s.provider_closed_at is not null then perform public.finish_live_voice_test(s.id,coalesce(s.end_reason,'provider_closed')); end if;
end $$;
revoke all on function public.reserve_voice_delegation(uuid,text),public.finish_voice_delegation(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_voice_delegation(uuid,text),public.finish_voice_delegation(uuid,text,bigint) to service_role;
