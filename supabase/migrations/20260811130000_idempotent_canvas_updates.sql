alter table public.canvas_updates
  add column client_update_id uuid;

update public.canvas_updates
set client_update_id = gen_random_uuid()
where client_update_id is null;

alter table public.canvas_updates
  alter column client_update_id set not null,
  alter column client_update_id set default gen_random_uuid();

create unique index canvas_updates_actor_client_update_idx
  on public.canvas_updates (canvas_id, actor_id, client_update_id);

create function public.append_canvas_update(
  target_canvas_id uuid,
  client_update_id uuid,
  update_data bytea
)
returns table(sequence bigint, created_at timestamptz, inserted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_update public.canvas_updates%rowtype;
  next_sequence bigint;
begin
  if auth.uid() is null or not private.has_canvas_role(
    target_canvas_id,
    array['owner', 'editor']::public.canvas_role[]
  ) then
    raise exception 'canvas update is not permitted' using errcode = '42501';
  end if;

  if client_update_id is null or update_data is null or octet_length(update_data) = 0 then
    raise exception 'canvas update input is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_canvas_id::text, 0));

  select *
  into existing_update
  from public.canvas_updates u
  where u.canvas_id = target_canvas_id
    and u.actor_id = auth.uid()
    and u.client_update_id = append_canvas_update.client_update_id;

  if found then
    if existing_update.update_data <> append_canvas_update.update_data then
      raise exception 'client update id was reused with different content' using errcode = '22000';
    end if;

    return query select existing_update.sequence, existing_update.created_at, false;
    return;
  end if;

  select greatest(
    coalesce((select max(u.sequence) from public.canvas_updates u where u.canvas_id = target_canvas_id), 0),
    coalesce((select max(s.last_sequence) from public.canvas_snapshots s where s.canvas_id = target_canvas_id), 0)
  ) + 1
  into next_sequence;

  return query
  insert into public.canvas_updates (
    canvas_id,
    sequence,
    update_data,
    actor_id,
    client_update_id
  ) values (
    target_canvas_id,
    next_sequence,
    update_data,
    auth.uid(),
    client_update_id
  )
  returning canvas_updates.sequence, canvas_updates.created_at, true;
end;
$$;

revoke all on function public.append_canvas_update(uuid, uuid, bytea) from public, anon;
grant execute on function public.append_canvas_update(uuid, uuid, bytea) to authenticated;
