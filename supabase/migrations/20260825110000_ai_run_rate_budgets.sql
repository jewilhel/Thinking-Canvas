alter table public.ai_runs
  add column rate_window_started_at timestamptz,
  add column reserved_input_tokens bigint check (
    reserved_input_tokens is null or reserved_input_tokens between 0 and 1000000
  ),
  add column reserved_output_tokens bigint check (
    reserved_output_tokens is null or reserved_output_tokens between 0 and 16000
  ),
  add column budget_reserved_at timestamptz,
  add constraint ai_runs_budget_reservation_complete check (
    (rate_window_started_at is null
      and reserved_input_tokens is null
      and reserved_output_tokens is null
      and budget_reserved_at is null)
    or
    (rate_window_started_at is not null
      and reserved_input_tokens is not null
      and reserved_output_tokens is not null
      and budget_reserved_at is not null)
  );

create function public.reserve_ai_run_budget(
  target_run_id uuid,
  target_requester_id uuid,
  target_input_tokens bigint,
  target_output_tokens bigint
)
returns table (
  reserved boolean,
  window_ends_at timestamptz,
  user_request_count bigint,
  canvas_request_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.ai_runs%rowtype;
  actor_role public.canvas_role;
  ai_enabled boolean;
  next_window_started_at timestamptz := date_bin(
    '5 minutes'::interval,
    statement_timestamp(),
    '2000-01-01 00:00:00+00'::timestamptz
  );
  next_window_ends_at timestamptz := next_window_started_at + '5 minutes'::interval;
  user_requests bigint;
  canvas_requests bigint;
  user_input bigint;
  user_output bigint;
  canvas_input bigint;
  canvas_output bigint;
  user_lock bigint;
  canvas_lock bigint;
begin
  if target_requester_id is null then
    raise exception 'AI budget requester is required.' using errcode = '22023';
  end if;
  if target_input_tokens is null or target_input_tokens not between 1 and 1000000 then
    raise exception 'AI input budget is invalid.' using errcode = '22023';
  end if;
  if target_output_tokens is null or target_output_tokens not between 256 and 16000 then
    raise exception 'AI output budget is invalid.' using errcode = '22023';
  end if;

  select * into target_run
  from public.ai_runs run
  where run.id = target_run_id
  for update;
  if not found or target_run.requested_by <> target_requester_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;
  if target_run.budget_reserved_at is not null then
    return query
    select false,
      target_run.rate_window_started_at + '5 minutes'::interval,
      coalesce((
        select sum(budget_window.request_count)::bigint
        from public.ai_rate_limit_windows budget_window
        where budget_window.user_id = target_requester_id
          and budget_window.window_started_at = target_run.rate_window_started_at
      ), 0),
      coalesce((
        select sum(budget_window.request_count)::bigint
        from public.ai_rate_limit_windows budget_window
        where budget_window.canvas_id = target_run.canvas_id
          and budget_window.window_started_at = target_run.rate_window_started_at
      ), 0);
    return;
  end if;
  if target_run.status not in ('projecting', 'thinking') then
    raise exception 'AI run is not available for budget reservation.' using errcode = '22023';
  end if;

  select membership.role, settings.enabled
  into actor_role, ai_enabled
  from public.canvas_members membership
  join public.canvas_ai_settings settings on settings.canvas_id = membership.canvas_id
  where membership.canvas_id = target_run.canvas_id
    and membership.user_id = target_requester_id;
  if actor_role is null or actor_role not in ('owner', 'editor', 'commenter') or not ai_enabled then
    raise exception 'AI access is no longer permitted.' using errcode = '42501';
  end if;

  user_lock := hashtextextended('ai-budget-user:' || target_requester_id::text, 0);
  canvas_lock := hashtextextended('ai-budget-canvas:' || target_run.canvas_id::text, 0);
  perform pg_advisory_xact_lock(least(user_lock, canvas_lock));
  if user_lock <> canvas_lock then
    perform pg_advisory_xact_lock(greatest(user_lock, canvas_lock));
  end if;

  select
    coalesce(sum(budget_window.request_count), 0),
    coalesce(sum(budget_window.input_tokens), 0),
    coalesce(sum(budget_window.output_tokens), 0)
  into user_requests, user_input, user_output
  from public.ai_rate_limit_windows budget_window
  where budget_window.user_id = target_requester_id
    and budget_window.window_started_at = next_window_started_at;

  select
    coalesce(sum(budget_window.request_count), 0),
    coalesce(sum(budget_window.input_tokens), 0),
    coalesce(sum(budget_window.output_tokens), 0)
  into canvas_requests, canvas_input, canvas_output
  from public.ai_rate_limit_windows budget_window
  where budget_window.canvas_id = target_run.canvas_id
    and budget_window.window_started_at = next_window_started_at;

  if user_requests + 1 > 60 then
    raise exception 'Your AI request limit is reached. Retry after the current five-minute window.' using errcode = 'P0001';
  end if;
  if canvas_requests + 1 > 180 then
    raise exception 'This canvas AI request limit is reached. Retry after the current five-minute window.' using errcode = 'P0001';
  end if;
  if user_input + target_input_tokens > 4000000
    or user_output + target_output_tokens > 240000 then
    raise exception 'Your AI token budget is reached. Retry after the current five-minute window.' using errcode = 'P0001';
  end if;
  if canvas_input + target_input_tokens > 12000000
    or canvas_output + target_output_tokens > 720000 then
    raise exception 'This canvas AI token budget is reached. Retry after the current five-minute window.' using errcode = 'P0001';
  end if;

  insert into public.ai_rate_limit_windows (
    canvas_id, user_id, window_started_at, window_ends_at,
    request_count, input_tokens, output_tokens, updated_at
  ) values (
    target_run.canvas_id, target_requester_id,
    next_window_started_at, next_window_ends_at,
    1, target_input_tokens, target_output_tokens, now()
  )
  on conflict (canvas_id, user_id, window_started_at) do update
  set request_count = public.ai_rate_limit_windows.request_count + 1,
      input_tokens = public.ai_rate_limit_windows.input_tokens + excluded.input_tokens,
      output_tokens = public.ai_rate_limit_windows.output_tokens + excluded.output_tokens,
      updated_at = now();

  update public.ai_runs run
  set rate_window_started_at = next_window_started_at,
      reserved_input_tokens = target_input_tokens,
      reserved_output_tokens = target_output_tokens,
      budget_reserved_at = now(),
      updated_at = now()
  where run.id = target_run.id;

  return query select true, next_window_ends_at, user_requests + 1, canvas_requests + 1;
end;
$$;

revoke all on function public.reserve_ai_run_budget(uuid, uuid, bigint, bigint)
from public, anon, authenticated;

grant execute on function public.reserve_ai_run_budget(uuid, uuid, bigint, bigint)
to service_role;
