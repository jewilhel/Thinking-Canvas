alter table public.ai_change_sets
  add column ai_run_id uuid references public.ai_runs (id) on delete set null,
  add column tool_call_key text check (
    tool_call_key is null or char_length(tool_call_key) between 1 and 255
  ),
  add column stage_fingerprint text check (
    stage_fingerprint is null or stage_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint ai_change_sets_ai_stage_shape check (
    (ai_run_id is null and tool_call_key is null and stage_fingerprint is null)
    or
    (ai_run_id is not null and tool_call_key is not null and stage_fingerprint is not null)
  );

create unique index ai_change_sets_run_tool_call_idx
  on public.ai_change_sets (ai_run_id, tool_call_key)
  where ai_run_id is not null;

create function private.is_ai_staged_change_set(target_change_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select change_set.ai_run_id is not null
      from public.ai_change_sets change_set
      where change_set.id = target_change_set_id),
    false
  );
$$;

create function private.is_ai_staged_object_change(target_object_change_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select change_set.ai_run_id is not null
      from public.ai_object_changes object_change
      join public.ai_change_sets change_set on change_set.id = object_change.change_set_id
      where object_change.id = target_object_change_id),
    false
  );
$$;

drop policy ai_change_sets_insert on public.ai_change_sets;
create policy ai_change_sets_insert on public.ai_change_sets for insert to authenticated
  with check (
    requested_by = auth.uid()
    and ai_run_id is null
    and tool_call_key is null
    and stage_fingerprint is null
    and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[])
  );

drop policy ai_change_sets_update on public.ai_change_sets;
create policy ai_change_sets_update on public.ai_change_sets for update to authenticated
  using (
    ai_run_id is null
    and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[])
  )
  with check (
    ai_run_id is null
    and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[])
  );

drop policy ai_change_sets_delete on public.ai_change_sets;
create policy ai_change_sets_delete on public.ai_change_sets for delete to authenticated
  using (
    ai_run_id is null
    and private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[])
  );

drop policy ai_object_changes_write on public.ai_object_changes;
create policy ai_object_changes_write on public.ai_object_changes for all to authenticated
  using (
    not private.is_ai_staged_change_set(change_set_id)
    and private.has_canvas_role(
      private.change_set_canvas(change_set_id),
      array['owner', 'editor']::public.canvas_role[]
    )
  )
  with check (
    not private.is_ai_staged_change_set(change_set_id)
    and private.has_canvas_role(
      private.change_set_canvas(change_set_id),
      array['owner', 'editor']::public.canvas_role[]
    )
  );

drop policy review_decisions_insert on public.review_decisions;
create policy review_decisions_insert on public.review_decisions for insert to authenticated
  with check (
    not private.is_ai_staged_object_change(object_change_id)
    and reviewer_id = auth.uid()
    and private.has_canvas_role(
      private.object_change_canvas(object_change_id),
      array['owner', 'editor', 'commenter']::public.canvas_role[]
    )
  );

drop policy review_decisions_update on public.review_decisions;
create policy review_decisions_update on public.review_decisions for update to authenticated
  using (
    not private.is_ai_staged_object_change(object_change_id)
    and reviewer_id = auth.uid()
    and private.has_canvas_role(
      private.object_change_canvas(object_change_id),
      array['owner', 'editor', 'commenter']::public.canvas_role[]
    )
  )
  with check (
    not private.is_ai_staged_object_change(object_change_id)
    and reviewer_id = auth.uid()
    and private.has_canvas_role(
      private.object_change_canvas(object_change_id),
      array['owner', 'editor', 'commenter']::public.canvas_role[]
    )
  );

drop policy review_decisions_delete on public.review_decisions;
create policy review_decisions_delete on public.review_decisions for delete to authenticated
  using (
    not private.is_ai_staged_object_change(object_change_id)
    and reviewer_id = auth.uid()
    and private.has_canvas_role(
      private.object_change_canvas(object_change_id),
      array['owner', 'editor', 'commenter']::public.canvas_role[]
    )
  );

create function public.stage_ai_canvas_changes(
  target_run_id uuid,
  target_requester_id uuid,
  target_call_key text,
  target_summary text,
  target_changes jsonb,
  target_expected_sequence bigint
)
returns table (change_set_id uuid, object_change_count integer, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.ai_runs%rowtype;
  target_source_comment public.comments%rowtype;
  existing_execution public.ai_tool_executions%rowtype;
  existing_change_set public.ai_change_sets%rowtype;
  next_change_set_id uuid := extensions.gen_random_uuid();
  next_execution_id uuid := extensions.gen_random_uuid();
  actor_role public.canvas_role;
  current_authority public.ai_authority_level;
  current_sequence bigint;
  change_count integer;
  target_change jsonb;
  target_object_id uuid;
  before_state jsonb;
  after_state jsonb;
  affected_fields text[];
  affected_object_ids uuid[] := array[]::uuid[];
  stage_fingerprint text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_requester_id is null then
    raise exception 'An accountable requester is required.' using errcode = '22023';
  end if;
  if target_call_key is null or char_length(target_call_key) not between 1 and 255 then
    raise exception 'Tool call identity is invalid.' using errcode = '22023';
  end if;
  target_summary := btrim(target_summary);
  if target_summary is null or char_length(target_summary) not between 1 and 10000 then
    raise exception 'A review-stage summary is required.' using errcode = '22023';
  end if;
  if target_changes is null or jsonb_typeof(target_changes) <> 'array' then
    raise exception 'Review-stage changes must be an array.' using errcode = '22023';
  end if;
  change_count := jsonb_array_length(target_changes);
  if change_count not between 1 and 1000 then
    raise exception 'A review stage requires between 1 and 1000 object changes.' using errcode = '22023';
  end if;
  if target_expected_sequence is null or target_expected_sequence < 0 then
    raise exception 'Projection sequence is invalid.' using errcode = '22023';
  end if;

  select * into target_run
  from public.ai_runs
  where id = target_run_id
  for update;
  if not found or target_run.requested_by <> target_requester_id then
    raise exception 'AI run is not accessible.' using errcode = '42501';
  end if;

  for target_change in select value from jsonb_array_elements(target_changes)
  loop
    if jsonb_typeof(target_change) <> 'object'
      or target_change - array['objectId', 'beforeState', 'afterState', 'affectedFields'] <> '{}'::jsonb
      or not target_change ?& array['objectId', 'beforeState', 'afterState', 'affectedFields'] then
      raise exception 'A staged object change has invalid fields.' using errcode = '22023';
    end if;
    begin
      target_object_id := (target_change ->> 'objectId')::uuid;
    exception when invalid_text_representation then
      raise exception 'A staged object identity is invalid.' using errcode = '22023';
    end;
    before_state := target_change -> 'beforeState';
    after_state := target_change -> 'afterState';
    if jsonb_typeof(before_state) <> 'object' or jsonb_typeof(after_state) <> 'object'
      or before_state - array['object', 'orderIndex'] <> '{}'::jsonb
      or after_state - array['object', 'orderIndex'] <> '{}'::jsonb
      or not before_state ?& array['object', 'orderIndex']
      or not after_state ?& array['object', 'orderIndex'] then
      raise exception 'Staged before and after state is invalid.' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(before_state -> 'object'), 'null') not in ('object', 'null')
      or coalesce(jsonb_typeof(after_state -> 'object'), 'null') not in ('object', 'null')
      or (before_state -> 'object') = 'null'::jsonb and (after_state -> 'object') = 'null'::jsonb then
      raise exception 'A staged change requires before or after object state.' using errcode = '22023';
    end if;
    if (before_state -> 'object') <> 'null'::jsonb and (
      before_state #>> '{object,id}' <> target_object_id::text
      or before_state #>> '{object,canvasId}' <> target_run.canvas_id::text
    ) then
      raise exception 'Staged before state is outside the run canvas.' using errcode = '22023';
    end if;
    if (after_state -> 'object') <> 'null'::jsonb and (
      after_state #>> '{object,id}' <> target_object_id::text
      or after_state #>> '{object,canvasId}' <> target_run.canvas_id::text
    ) then
      raise exception 'Staged after state is outside the run canvas.' using errcode = '22023';
    end if;
    if jsonb_typeof(target_change -> 'affectedFields') <> 'array'
      or jsonb_array_length(target_change -> 'affectedFields') not between 1 and 1000
      or exists (
        select 1 from jsonb_array_elements(target_change -> 'affectedFields') field
        where jsonb_typeof(field) <> 'string'
          or char_length(field #>> '{}') not between 1 and 255
      ) then
      raise exception 'Staged affected fields are invalid.' using errcode = '22023';
    end if;
    select array_agg(field #>> '{}' order by ordinal)
    into affected_fields
    from jsonb_array_elements(target_change -> 'affectedFields') with ordinality fields(field, ordinal);
    if cardinality(affected_fields) <> cardinality(array(select distinct unnest(affected_fields))) then
      raise exception 'Staged affected fields must be unique.' using errcode = '22023';
    end if;
    if target_object_id = any(affected_object_ids) then
      raise exception 'Staged object identities must be unique.' using errcode = '22023';
    end if;
    affected_object_ids := array_append(affected_object_ids, target_object_id);
  end loop;

  stage_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object('summary', target_summary, 'changes', target_changes)::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );
  select * into existing_execution
  from public.ai_tool_executions execution
  where execution.run_id = target_run.id and execution.call_key = target_call_key;
  if found then
    select * into existing_change_set
    from public.ai_change_sets change_set
    where change_set.id = existing_execution.change_set_id;
    if existing_execution.tool_name <> 'stage_canvas_changes'
      or existing_execution.affected_object_ids <> affected_object_ids
      or existing_execution.outcome <> 'succeeded'
      or existing_execution.command_id is not null
      or existing_execution.comment_id is not null
      or existing_change_set.id is null
      or existing_change_set.stage_fingerprint <> stage_fingerprint then
      raise exception 'The tool call identity was reused with different or mutating work.' using errcode = '23505';
    end if;
    return query select existing_change_set.id, change_count, false;
    return;
  end if;

  if target_run.status not in ('projecting', 'thinking', 'tool_pending') then
    raise exception 'AI run is not available for tool execution.' using errcode = '22023';
  end if;
  select * into target_source_comment
  from public.comments
  where id = target_run.invoking_comment_id
    and canvas_id = target_run.canvas_id
  for update;
  if not found or target_source_comment.status <> 'open' then
    raise exception 'The invoking comment is no longer open.' using errcode = '22023';
  end if;

  select membership.role,
    case
      when not settings.enabled then null
      when membership.role in ('owner', 'editor') then settings.authority
      else null
    end
  into actor_role, current_authority
  from public.canvas_members membership
  join public.canvas_ai_settings settings on settings.canvas_id = membership.canvas_id
  where membership.canvas_id = target_run.canvas_id
    and membership.user_id = target_requester_id;
  if actor_role is null or actor_role not in ('owner', 'editor') then
    raise exception 'Canvas review-stage access is no longer permitted.' using errcode = '42501';
  end if;
  if current_authority not in ('edit_with_review', 'trusted_editor') then
    raise exception 'Current AI authority does not allow review staging.' using errcode = '42501';
  end if;

  select greatest(
    coalesce((select max(snapshot.last_sequence) from public.canvas_snapshots snapshot where snapshot.canvas_id = target_run.canvas_id), 0),
    coalesce((select max(canvas_update.sequence) from public.canvas_updates canvas_update where canvas_update.canvas_id = target_run.canvas_id), 0)
  ) into current_sequence;
  if current_sequence <> target_expected_sequence then
    raise exception 'The canvas changed after the AI projection was built.' using errcode = '40001';
  end if;

  insert into public.ai_change_sets (
    id, canvas_id, requested_by, request_id, status,
    ai_run_id, tool_call_key, stage_fingerprint
  ) values (
    next_change_set_id, target_run.canvas_id, target_requester_id, target_call_key, 'pending',
    target_run.id, target_call_key, stage_fingerprint
  );

  for target_change in select value from jsonb_array_elements(target_changes)
  loop
    insert into public.ai_object_changes (
      id, change_set_id, object_id, before_state, after_state,
      affected_fields, explanation
    ) values (
      extensions.gen_random_uuid(),
      next_change_set_id,
      (target_change ->> 'objectId')::uuid,
      target_change -> 'beforeState',
      target_change -> 'afterState',
      array(select value #>> '{}' from jsonb_array_elements(target_change -> 'affectedFields')),
      target_summary
    );
  end loop;

  insert into public.ai_tool_executions (
    id, run_id, call_key, tool_name, affected_object_ids,
    outcome, change_set_id
  ) values (
    next_execution_id, target_run.id, target_call_key, 'stage_canvas_changes',
    affected_object_ids, 'succeeded', next_change_set_id
  );

  update public.ai_runs
  set status = 'tool_pending', authority_snapshot = current_authority, updated_at = now()
  where id = target_run.id;

  return query select next_change_set_id, change_count, true;
end;
$$;

revoke all on function public.stage_ai_canvas_changes(
  uuid, uuid, text, text, jsonb, bigint
) from public, anon, authenticated;

grant execute on function public.stage_ai_canvas_changes(
  uuid, uuid, text, text, jsonb, bigint
) to service_role;
