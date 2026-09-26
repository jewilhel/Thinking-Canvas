-- Metadata only. Preserve the legacy Realtime ledger and every existing charge.
alter table public.voice_test_sessions
  add column api_kind text not null default 'realtime' check (api_kind in ('realtime','live')),
  add column accounting_version integer not null default 1,
  add column units_per_cent integer not null default 12000 check (units_per_cent > 0),
  add column voice_usage_units bigint not null default 0 check (voice_usage_units >= 0),
  add column voice_usage_final boolean not null default false,
  add column close_requested_at timestamptz,
  add column idle_warning_at timestamptz,
  add column idle_keepalive_at timestamptz,
  add column idle_seconds integer not null default 120 check (idle_seconds between 30 and 300),
  add column idle_warning_seconds integer not null default 15 check (idle_warning_seconds between 5 and 30);

create function public.reserve_live_voice_test(target_id uuid, target_canvas uuid, target_user uuid, target_previous uuid default null)
returns public.voice_test_sessions language plpgsql security definer set search_path = '' as $$
declare
  budget public.voice_test_days;
  result public.voice_test_sessions;
  previous public.voice_test_sessions;
  day_key date := (now() at time zone 'America/Los_Angeles')::date;
  midnight timestamptz := (((now() at time zone 'America/Los_Angeles')::date + 1)::timestamp at time zone 'America/Los_Angeles');
  deadline timestamptz;
  reservation integer;
  minimum_reservation integer;
begin
  if not exists(select 1 from public.canvases c where c.id=target_canvas and
    (c.owner_id=target_user or exists(select 1 from public.canvas_members m where m.canvas_id=c.id and m.user_id=target_user and m.role in ('editor','commenter'))))
    or not exists(select 1 from public.canvas_ai_settings s where s.canvas_id=target_canvas and s.enabled) then
    raise exception 'Voice access denied' using errcode='42501';
  end if;
  if target_previous is not null then
    select * into previous from public.voice_test_sessions where id=target_previous and canvas_id=target_canvas and user_id=target_user;
    if not found or previous.ended_at is null or previous.expires_at <= now() then
      raise exception 'Previous voice test cannot be restarted' using errcode='42501';
    end if;
  end if;
  insert into public.voice_test_days(day) values(day_key) on conflict do nothing;
  select * into budget from public.voice_test_days where day=day_key for update;
  -- Unknown older calls block admission even after the Pacific day changes.
  if budget.reserved_cents > 0 or exists(select 1 from public.voice_test_sessions where ended_at is null) then
    raise exception 'Voice testing allowance unavailable';
  end if;
  -- Termination headroom stays inside the admitting day; no midnight overrun is assumed free.
  deadline := least(now()+interval '10 minutes',midnight-interval '60 seconds',previous.expires_at);
  if deadline <= now() then raise exception 'Voice testing resumes after midnight Pacific'; end if;
  minimum_reservation := ceil((greatest(15000,extract(epoch from (deadline-now()))*1000)+60000)/12000)::integer;
  if budget.spent_cents + minimum_reservation > 2000 then raise exception 'Voice testing allowance unavailable'; end if;
  -- Retain the remaining shared allowance until provider finalization. The smaller
  -- planned-duration amount alone cannot cover an unconfirmed termination.
  reservation := 2000-budget.spent_cents;
  update public.voice_test_days set reserved_cents=reservation where day=day_key;
  insert into public.voice_test_sessions(id,canvas_id,user_id,day,expires_at,reserved_cents,api_kind,accounting_version)
    values(target_id,target_canvas,target_user,day_key,deadline,reservation,'live',2) returning * into result;
  return result;
end $$;

-- Snapshots are cumulative. Repeats and out-of-order observations never add charges.
create function public.checkpoint_live_voice_usage(target_id uuid, target_units bigint, target_final boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_units is null or target_units < 15000 then raise exception 'Invalid Live duration'; end if;
  update public.voice_test_sessions
    set voice_usage_units=greatest(voice_usage_units,target_units),
        voice_usage_final=voice_usage_final or target_final
    where id=target_id and api_kind='live' and ended_at is null;
end $$;

-- A confirmed close can have unknown final usage; charge the reservation in that
-- case. Never release an unconfirmed provider session merely because its socket closed.
create function public.finish_live_voice_test(target_id uuid, target_reason text, target_rejected boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare session public.voice_test_sessions; charge integer;
begin
  select * into session from public.voice_test_sessions where id=target_id for update;
  if not found or session.ended_at is not null then return; end if;
  if session.api_kind <> 'live' then raise exception 'Not a Live session'; end if;
  if target_rejected and session.call_id is not null then raise exception 'Created sessions are not rejected handshakes'; end if;
  if session.voice_usage_units > session.reserved_cents::bigint * session.units_per_cent then raise exception 'Live usage exceeds its reservation; reconciliation required'; end if;
  charge := case when target_rejected then 0
    when session.voice_usage_final then least(session.reserved_cents,ceil(greatest(15000,session.voice_usage_units)::numeric/session.units_per_cent)::integer)
    else session.reserved_cents end;
  perform public.finish_voice_test(target_id,charge,target_reason);
end $$;

revoke all on function public.reserve_live_voice_test(uuid,uuid,uuid,uuid), public.checkpoint_live_voice_usage(uuid,bigint,boolean), public.finish_live_voice_test(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.reserve_live_voice_test(uuid,uuid,uuid,uuid), public.checkpoint_live_voice_usage(uuid,bigint,boolean), public.finish_live_voice_test(uuid,text,boolean) to service_role;
