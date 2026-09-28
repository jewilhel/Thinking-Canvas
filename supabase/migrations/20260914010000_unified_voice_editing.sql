-- Product owner requested one full editing mode without authority switching.
update public.canvas_ai_settings set authority = 'trusted_editor';

create function public.undo_voice_ai_change_set(
  target_run_id uuid,
  target_change_set_id uuid,
  target_actor_id uuid,
  target_idempotency_key uuid,
  target_update_data bytea,
  target_expected_sequence bigint,
  target_conflicts jsonb default '[]'::jsonb
)
returns table(change_set_id uuid, result_sequence bigint, created boolean, conflict_count integer)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.ai_runs r
    join public.voice_delegations d on d.ai_run_id = r.id
    join public.ai_change_sets c on c.id = target_change_set_id and c.canvas_id = r.canvas_id
    join public.canvas_ai_settings s on s.canvas_id = r.canvas_id
    where r.id = target_run_id and r.requested_by = target_actor_id
      and s.enabled and s.authority in ('edit_with_review', 'trusted_editor')
  ) then
    raise exception 'Voice undo is not authorized' using errcode = '42501';
  end if;
  perform private.assert_voice_run_active(target_run_id);
  return query select * from public.undo_ai_change_set(
    target_change_set_id, target_actor_id, target_idempotency_key,
    target_update_data, target_expected_sequence, target_conflicts
  );
end;
$$;
revoke all on function public.undo_voice_ai_change_set(uuid,uuid,uuid,uuid,bytea,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.undo_voice_ai_change_set(uuid,uuid,uuid,uuid,bytea,bigint,jsonb) to service_role;
