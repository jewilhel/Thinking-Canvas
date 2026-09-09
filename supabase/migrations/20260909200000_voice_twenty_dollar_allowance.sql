-- Owner approved $20 shared daily cap. Preserve all prior accounting.
alter table public.voice_test_days drop constraint voice_test_days_check;
alter table public.voice_test_days add constraint voice_test_days_check check (spent_cents + reserved_cents <= 2000);
alter table public.voice_test_sessions drop constraint voice_test_sessions_reserved_cents_check;
alter table public.voice_test_sessions add constraint voice_test_sessions_reserved_cents_check check (reserved_cents between 1 and 2000);

create or replace function public.reserve_voice_test(target_id uuid, target_canvas uuid, target_user uuid, target_previous uuid default null)
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
  if budget.reserved_cents > 0 or budget.spent_cents > 1750 then
    raise exception 'Voice testing allowance unavailable' using errcode='P0001';
  end if;
  update public.voice_test_days set reserved_cents=2000-budget.spent_cents where day=day_key;
  insert into public.voice_test_sessions(id,canvas_id,user_id,day,expires_at,reserved_cents)
    values(target_id,target_canvas,target_user,day_key,least(now()+interval '10 minutes',midnight,previous.expires_at),2000-budget.spent_cents)
    returning * into result;
  return result;
end $$;

