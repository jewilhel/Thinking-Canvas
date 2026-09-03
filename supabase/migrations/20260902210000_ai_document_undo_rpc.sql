create function public.attach_ai_document_undo(
  target_change_set_id uuid,
  target_run_id uuid,
  target_requester_id uuid,
  target_document_object_id uuid,
  target_document_undo_update bytea
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_document_undo_update is null
    or octet_length(target_document_undo_update) not between 1 and 10485760 then
    raise exception 'Document undo update is invalid.' using errcode = '22023';
  end if;

  update public.ai_change_sets change_set
  set document_object_id = target_document_object_id,
      document_undo_update = target_document_undo_update
  where change_set.id = target_change_set_id
    and change_set.ai_run_id = target_run_id
    and change_set.requested_by = target_requester_id
    and change_set.status = 'pending'
    and exists (
      select 1
      from public.ai_object_changes object_change
      where object_change.change_set_id = change_set.id
        and object_change.object_id = target_document_object_id
    );

  if not found then
    raise exception 'Document change set is no longer available.' using errcode = '40001';
  end if;

  return true;
end;
$$;

revoke all on function public.attach_ai_document_undo(uuid, uuid, uuid, uuid, bytea)
  from public, anon, authenticated;
grant execute on function public.attach_ai_document_undo(uuid, uuid, uuid, uuid, bytea)
  to service_role;
