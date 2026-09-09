-- Operational metadata only. No audio, transcripts, SDP, or provider events.
create table public.voice_test_days (
  day date primary key,
  spent_cents integer not null default 0 check (spent_cents >= 0),
  reserved_cents integer not null default 0 check (reserved_cents >= 0),
  check (spent_cents + reserved_cents <= 1000)
);
create table public.voice_test_sessions (
  id uuid primary key,
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null references public.voice_test_days(day),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reserved_cents integer not null check (reserved_cents between 1 and 1000),
  charged_cents integer not null default 0,
  call_id text,
  supervisor_ready boolean not null default false,
  heartbeat_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  constraint voice_session_duration check (expires_at <= started_at + interval '10 minutes')
);
alter table public.voice_test_days enable row level security;
alter table public.voice_test_sessions enable row level security;
revoke all on public.voice_test_days, public.voice_test_sessions from anon, authenticated;
grant all on public.voice_test_days, public.voice_test_sessions to service_role;

create function public.reserve_voice_test(target_id uuid, target_canvas uuid, target_user uuid, target_previous uuid default null)
returns public.voice_test_sessions language plpgsql security definer set search_path = '' as $$
declare
  budget public.voice_test_days;
  result public.voice_test_sessions;
  previous public.voice_test_sessions;
  day_key date := (now() at time zone 'America/Los_Angeles')::date;
  midnight timestamptz := (((now() at time zone 'America/Los_Angeles')::date + 1)::timestamp at time zone 'America/Los_Angeles');
begin
  -- Recheck membership and AI enablement in the same transaction as admission.
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
  -- One reservation across ALL test users/canvases. Unknown/orphaned usage retains it.
  if budget.reserved_cents > 0 or budget.spent_cents > 750 then
    raise exception 'Voice testing allowance unavailable' using errcode='P0001';
  end if;
  update public.voice_test_days set reserved_cents=1000-budget.spent_cents where day=day_key;
  insert into public.voice_test_sessions(id,canvas_id,user_id,day,expires_at,reserved_cents)
    values(target_id,target_canvas,target_user,day_key,least(now()+interval '10 minutes',midnight,previous.expires_at),1000-budget.spent_cents)
    returning * into result;
  return result;
end $$;

create function public.finish_voice_test(target_id uuid, target_cents integer, target_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare session public.voice_test_sessions;
begin
  select * into session from public.voice_test_sessions where id=target_id for update;
  if not found or session.ended_at is not null then return; end if;
  if target_cents < 0 or target_cents > session.reserved_cents then
    raise exception 'Invalid voice accounting amount';
  end if;
  update public.voice_test_days set reserved_cents=reserved_cents-session.reserved_cents,
    spent_cents=spent_cents+target_cents where day=session.day;
  update public.voice_test_sessions set ended_at=now(),charged_cents=target_cents,end_reason=left(target_reason,80) where id=target_id;
end $$;
revoke all on function public.reserve_voice_test(uuid,uuid,uuid,uuid), public.finish_voice_test(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.reserve_voice_test(uuid,uuid,uuid,uuid), public.finish_voice_test(uuid,integer,text) to service_role;

create function public.voice_test_has_access(target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.voice_test_sessions s
    join public.canvases c on c.id=s.canvas_id
    join public.canvas_ai_settings a on a.canvas_id=c.id and a.enabled
    where s.id=target_id and s.ended_at is null and s.expires_at>now()
    and (c.owner_id=s.user_id or exists(select 1 from public.canvas_members m
      where m.canvas_id=c.id and m.user_id=s.user_id and m.role in ('editor','commenter'))));
$$;
revoke all on function public.voice_test_has_access(uuid) from public,anon,authenticated;
grant execute on function public.voice_test_has_access(uuid) to service_role;
