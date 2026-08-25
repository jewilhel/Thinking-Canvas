create function public.complete_ai_run(
  target_run_id uuid,
  target_body text,
  target_provider_request_id text,
  target_projection_metadata jsonb,
  target_model text,
  target_input_tokens bigint,
  target_output_tokens bigint,
  target_latency_ms bigint
)
returns table (run_id uuid, reply_id uuid, status public.ai_run_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  completion record;
begin
  if target_model is null or char_length(target_model) not between 1 and 120 then
    raise exception 'AI model identity is invalid.' using errcode = '22023';
  end if;
  if target_input_tokens is null or target_input_tokens not between 0 and 10000000 then
    raise exception 'AI input token count is invalid.' using errcode = '22023';
  end if;
  if target_output_tokens is null or target_output_tokens not between 0 and 1000000 then
    raise exception 'AI output token count is invalid.' using errcode = '22023';
  end if;
  if target_latency_ms is null or target_latency_ms not between 0 and 3600000 then
    raise exception 'AI latency is invalid.' using errcode = '22023';
  end if;

  select * into completion
  from public.complete_fake_ai_run(
    target_run_id,
    target_body,
    target_provider_request_id,
    target_projection_metadata
  );

  update public.ai_runs run
  set model = target_model,
      input_tokens = target_input_tokens,
      output_tokens = target_output_tokens,
      latency_ms = target_latency_ms,
      updated_at = now()
  where run.id = completion.run_id
    and run.provider_request_id = target_provider_request_id
    and run.model = 'deterministic-fake'
    and run.input_tokens is null
    and run.output_tokens is null
    and run.latency_ms is null;

  return query select completion.run_id, completion.reply_id, completion.status;
end;
$$;

revoke all on function public.complete_ai_run(
  uuid, text, text, jsonb, text, bigint, bigint, bigint
) from public, anon;

grant execute on function public.complete_ai_run(
  uuid, text, text, jsonb, text, bigint, bigint, bigint
) to authenticated;
