alter table public.ai_change_sets
  add column transaction_undo_idempotency_key uuid,
  add column transaction_undone_by uuid references public.profiles (id) on delete restrict,
  add column transaction_undo_sequence bigint check (transaction_undo_sequence is null or transaction_undo_sequence > 0),
  add column transaction_undone_at timestamptz,
  add column transaction_undo_conflicts jsonb not null default '[]'::jsonb check (jsonb_typeof(transaction_undo_conflicts) = 'array'),
  add constraint ai_change_sets_transaction_undo_shape check (
    (transaction_undo_idempotency_key is null
      and transaction_undone_by is null
      and transaction_undo_sequence is null
      and transaction_undone_at is null)
    or
    (transaction_undo_idempotency_key is not null
      and transaction_undone_by is not null
      and transaction_undone_at is not null)
  );

create unique index ai_change_sets_transaction_undo_actor_key_idx
  on public.ai_change_sets (transaction_undone_by, transaction_undo_idempotency_key)
  where transaction_undo_idempotency_key is not null;

alter function public.finalize_ai_review_stage(
  uuid, uuid, text, jsonb, text, uuid[], jsonb
) rename to finalize_ai_review_stage_legacy;

revoke all on function public.finalize_ai_review_stage_legacy(
  uuid, uuid, text, jsonb, text, uuid[], jsonb
) from public, anon, authenticated;

create function public.finalize_ai_review_stage(
  target_change_set_id uuid,
  target_requester_id uuid,
  target_summary text,
  target_explanations jsonb,
  target_scope_kind text,
  target_scope_object_ids uuid[],
  target_visual_feedback_metadata jsonb default '{}'::jsonb
)
returns table (change_set_id uuid, object_change_count integer, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  finalized_change_set_id uuid;
  finalized_object_change_count integer;
  finalized_created boolean;
begin
  select result.change_set_id, result.object_change_count, result.created
  into finalized_change_set_id, finalized_object_change_count, finalized_created
  from public.finalize_ai_review_stage_legacy(
    target_change_set_id,
    target_requester_id,
    target_summary,
    target_explanations,
    target_scope_kind,
    target_scope_object_ids,
    target_visual_feedback_metadata
  ) result;

  delete from public.stories story
  where story.review_change_set_id = finalized_change_set_id;

  return query select
    finalized_change_set_id,
    finalized_object_change_count,
    finalized_created;
end;
$$;

revoke all on function public.finalize_ai_review_stage(
  uuid, uuid, text, jsonb, text, uuid[], jsonb
) from public, anon, authenticated;

grant execute on function public.finalize_ai_review_stage(
  uuid, uuid, text, jsonb, text, uuid[], jsonb
) to service_role;

create function public.undo_ai_change_set(
  target_change_set_id uuid,
  target_actor_id uuid,
  target_idempotency_key uuid,
  target_update_data bytea,
  target_expected_sequence bigint,
  target_conflicts jsonb default '[]'::jsonb
)
returns table (
  change_set_id uuid,
  result_sequence bigint,
  created boolean,
  conflict_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_change_set public.ai_change_sets%rowtype;
  current_sequence bigint;
  next_sequence bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_actor_id is null or target_idempotency_key is null
    or target_update_data is null or target_expected_sequence < 0
    or target_conflicts is null or jsonb_typeof(target_conflicts) <> 'array'
    or jsonb_array_length(target_conflicts) > 10000 then
    raise exception 'AI undo input is invalid.' using errcode = '22023';
  end if;

  select * into target_change_set
  from public.ai_change_sets change_set
  where change_set.id = target_change_set_id
  for update;
  if not found or target_change_set.ai_run_id is null
    or target_change_set.activation_sequence is null then
    raise exception 'AI change is not accessible.' using errcode = '42501';
  end if;
  if not coalesce(
    private.canvas_role(target_change_set.canvas_id, target_actor_id)
      = any(array['owner', 'editor']::public.canvas_role[]),
    false
  ) then
    raise exception 'Canvas undo is not permitted.' using errcode = '42501';
  end if;

  if target_change_set.transaction_undo_idempotency_key is not null then
    if target_change_set.transaction_undo_idempotency_key <> target_idempotency_key
      or target_change_set.transaction_undone_by <> target_actor_id then
      raise exception 'AI undo was already completed.' using errcode = '23505';
    end if;
    return query select
      target_change_set.id,
      target_change_set.transaction_undo_sequence,
      false,
      jsonb_array_length(target_change_set.transaction_undo_conflicts);
    return;
  end if;

  if target_change_set.status <> 'applied'
    or exists (
      select 1 from public.ai_object_changes object_change
      where object_change.change_set_id = target_change_set.id
        and object_change.review_status <> 'activated'
    ) then
    raise exception 'Only an active, unchanged AI transaction can be undone.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_change_set.canvas_id::text, 0));
  select greatest(
    coalesce((select max(snapshot.last_sequence) from public.canvas_snapshots snapshot where snapshot.canvas_id = target_change_set.canvas_id), 0),
    coalesce((select max(canvas_update.sequence) from public.canvas_updates canvas_update where canvas_update.canvas_id = target_change_set.canvas_id), 0)
  ) into current_sequence;
  if current_sequence <> target_expected_sequence then
    raise exception 'The canvas changed before the AI transaction could be undone.' using errcode = '40001';
  end if;

  next_sequence := null;
  if octet_length(target_update_data) > 0 then
    next_sequence := current_sequence + 1;
    insert into public.canvas_updates (
      canvas_id, sequence, update_data, actor_id, client_update_id
    ) values (
      target_change_set.canvas_id,
      next_sequence,
      target_update_data,
      target_actor_id,
      target_idempotency_key
    );
  end if;

  update public.ai_change_sets
  set status = 'complete',
      completed_at = now(),
      transaction_undo_idempotency_key = target_idempotency_key,
      transaction_undone_by = target_actor_id,
      transaction_undo_sequence = next_sequence,
      transaction_undone_at = now(),
      transaction_undo_conflicts = target_conflicts,
      updated_at = now()
  where id = target_change_set.id;

  update public.ai_object_changes object_change
  set review_status = case
        when jsonb_array_length(target_conflicts) = 0 then 'discarded'
        else 'conflicted'
      end,
      conflict_metadata = jsonb_build_object('conflicts', target_conflicts),
      result_sequence = coalesce(next_sequence, object_change.result_sequence)
  where object_change.change_set_id = target_change_set.id;

  return query select
    target_change_set.id,
    next_sequence,
    true,
    jsonb_array_length(target_conflicts);
end;
$$;

revoke all on function public.undo_ai_change_set(
  uuid, uuid, uuid, bytea, bigint, jsonb
) from public, anon, authenticated;

grant execute on function public.undo_ai_change_set(
  uuid, uuid, uuid, bytea, bigint, jsonb
) to service_role;
