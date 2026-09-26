alter table public.ai_change_sets
  add column organization_undo jsonb
  check (organization_undo is null or (
    jsonb_typeof(organization_undo) = 'object'
    and octet_length(organization_undo::text) <= 10485760
  ));

create function public.attach_ai_organization_undo(
  target_change_set_id uuid,
  target_run_id uuid,
  target_requester_id uuid,
  target_history jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_history is null or jsonb_typeof(target_history) <> 'object'
    or octet_length(target_history::text) > 10485760 then
    raise exception 'Organization undo history is invalid.' using errcode = '22023';
  end if;
  update public.ai_change_sets change_set
  set organization_undo = target_history
  where change_set.id = target_change_set_id
    and change_set.ai_run_id = target_run_id
    and change_set.requested_by = target_requester_id
    and change_set.status = 'pending';
  if not found then
    raise exception 'Organization change set is no longer available.' using errcode = '40001';
  end if;
  return true;
end;
$$;
revoke all on function public.attach_ai_organization_undo(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.attach_ai_organization_undo(uuid,uuid,uuid,jsonb) to service_role;
