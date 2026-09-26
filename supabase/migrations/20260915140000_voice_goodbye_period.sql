-- New Live calls reserve the complete goodbye period; old calls keep their deadline.
alter table public.voice_test_sessions add column wrap_up_at timestamptz;
alter table public.voice_test_sessions drop constraint voice_session_duration;
alter table public.voice_test_sessions add constraint voice_session_duration check (expires_at <= started_at + case when api_kind = 'live' then interval '12 minutes' else interval '10 minutes' end);
alter table public.voice_test_sessions add constraint voice_wrap_up_deadline check (wrap_up_at is null or (wrap_up_at <= expires_at and expires_at <= wrap_up_at + interval '2 minutes'));

create or replace function public.reserve_live_voice_test(target_id uuid, target_canvas uuid, target_user uuid, target_previous uuid default null)
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
  deadline := least(now()+interval '12 minutes',midnight-interval '60 seconds',previous.expires_at);
  if deadline <= now() then raise exception 'Voice testing resumes after midnight Pacific'; end if;
  minimum_reservation := ceil((greatest(15000,extract(epoch from (deadline-now()))*1000)+60000)/12000)::integer;
  if budget.spent_cents + minimum_reservation > 2000 then raise exception 'Voice testing allowance unavailable'; end if;
  -- Retain the remaining shared allowance until provider finalization. The smaller
  -- planned-duration amount alone cannot cover an unconfirmed termination.
  reservation := 2000-budget.spent_cents;
  update public.voice_test_days set reserved_cents=reservation where day=day_key;
  insert into public.voice_test_sessions(id,canvas_id,user_id,day,expires_at,reserved_cents,api_kind,accounting_version,wrap_up_at)
    values(target_id,target_canvas,target_user,day_key,deadline,reservation,'live',2,coalesce(previous.wrap_up_at,least(now()+interval '10 minutes',deadline-interval '2 minutes'))) returning * into result;
  return result;
end $$;

