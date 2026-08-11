create index canvas_updates_canvas_sequence_idx
  on public.canvas_updates (canvas_id, sequence);

create function public.append_canvas_update(
  target_canvas_id uuid,
  update_data bytea
)
returns table(sequence bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_sequence bigint;
begin
  if auth.uid() is null or not private.has_canvas_role(
    target_canvas_id,
    array['owner', 'editor']::public.canvas_role[]
  ) then
    raise exception 'canvas update is not permitted' using errcode = '42501';
  end if;

  if update_data is null or octet_length(update_data) = 0 then
    raise exception 'canvas update cannot be empty' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_canvas_id::text, 0));

  select greatest(
    coalesce((select max(u.sequence) from public.canvas_updates u where u.canvas_id = target_canvas_id), 0),
    coalesce((select max(s.last_sequence) from public.canvas_snapshots s where s.canvas_id = target_canvas_id), 0)
  ) + 1
  into next_sequence;

  return query
  insert into public.canvas_updates (canvas_id, sequence, update_data, actor_id)
  values (target_canvas_id, next_sequence, update_data, auth.uid())
  returning canvas_updates.sequence, canvas_updates.created_at;
end;
$$;

create function public.publish_canvas_compaction(
  target_canvas_id uuid,
  covered_last_sequence bigint,
  snapshot_state bytea,
  expected_state_hash text
)
returns table(version bigint, last_sequence bigint, state_hash text, pruned_updates bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_snapshot public.canvas_snapshots%rowtype;
  next_version bigint;
  required_update_count bigint;
  actual_update_count bigint;
  computed_state_hash text;
  deleted_count bigint;
begin
  if auth.uid() is null or not private.has_canvas_role(
    target_canvas_id,
    array['owner', 'editor']::public.canvas_role[]
  ) then
    raise exception 'canvas compaction is not permitted' using errcode = '42501';
  end if;

  if covered_last_sequence < 1 or snapshot_state is null or octet_length(snapshot_state) = 0 then
    raise exception 'invalid compaction input' using errcode = '22023';
  end if;

  computed_state_hash := encode(extensions.digest(snapshot_state, 'sha256'), 'hex');
  if computed_state_hash <> lower(expected_state_hash) then
    raise exception 'snapshot hash verification failed' using errcode = '22000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_canvas_id::text, 0));

  select *
  into latest_snapshot
  from public.canvas_snapshots s
  where s.canvas_id = target_canvas_id
  order by s.version desc
  limit 1;

  if latest_snapshot.last_sequence = covered_last_sequence then
    if latest_snapshot.state_hash <> computed_state_hash then
      raise exception 'compaction retry does not match the published snapshot' using errcode = '40001';
    end if;

    return query select
      latest_snapshot.version,
      latest_snapshot.last_sequence,
      latest_snapshot.state_hash,
      0::bigint;
    return;
  end if;

  if coalesce(latest_snapshot.last_sequence, 0) >= covered_last_sequence then
    raise exception 'compaction cannot move the snapshot boundary backward' using errcode = '40001';
  end if;

  required_update_count := covered_last_sequence - coalesce(latest_snapshot.last_sequence, 0);
  select count(*)
  into actual_update_count
  from public.canvas_updates u
  where u.canvas_id = target_canvas_id
    and u.sequence > coalesce(latest_snapshot.last_sequence, 0)
    and u.sequence <= covered_last_sequence;

  if actual_update_count <> required_update_count then
    raise exception 'compaction update range is incomplete' using errcode = '40001';
  end if;

  next_version := coalesce(latest_snapshot.version, 0) + 1;

  insert into public.canvas_snapshots (
    canvas_id,
    version,
    last_sequence,
    state,
    state_hash,
    created_by
  ) values (
    target_canvas_id,
    next_version,
    covered_last_sequence,
    snapshot_state,
    computed_state_hash,
    auth.uid()
  );

  delete from public.canvas_updates u
  where u.canvas_id = target_canvas_id and u.sequence <= covered_last_sequence;
  get diagnostics deleted_count = row_count;

  return query select next_version, covered_last_sequence, computed_state_hash, deleted_count;
end;
$$;

revoke all on function public.append_canvas_update(uuid, bytea) from public, anon;
revoke all on function public.publish_canvas_compaction(uuid, bigint, bytea, text) from public, anon;
grant execute on function public.append_canvas_update(uuid, bytea) to authenticated;
grant execute on function public.publish_canvas_compaction(uuid, bigint, bytea, text) to authenticated;

revoke insert, update, delete on table public.canvas_updates from authenticated;
revoke insert, update, delete on table public.canvas_snapshots from authenticated;

create policy canvas_realtime_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and realtime.topic() ~ '^canvas:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and private.canvas_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
);

create policy canvas_realtime_write
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() ~ '^canvas:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    (
      realtime.messages.extension = 'presence'
      and private.canvas_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
    )
    or (
      realtime.messages.extension = 'broadcast'
      and private.has_canvas_role(
        split_part(realtime.topic(), ':', 2)::uuid,
        array['owner', 'editor']::public.canvas_role[]
      )
    )
  )
);
