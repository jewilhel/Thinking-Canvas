alter table public.ai_change_sets
  add column source_comment_id uuid references public.comments (id) on delete set null,
  add column scope_kind text check (scope_kind in ('single_object', 'explicit_context', 'world_space')),
  add column scope_object_ids uuid[] not null default array[]::uuid[] check (cardinality(scope_object_ids) <= 1000),
  add column summary text check (summary is null or char_length(summary) between 1 and 10000),
  add column finalization_fingerprint text check (finalization_fingerprint is null or finalization_fingerprint ~ '^[0-9a-f]{64}$'),
  add column visual_feedback_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(visual_feedback_metadata) = 'object'),
  add column activation_sequence bigint check (activation_sequence is null or activation_sequence > 0),
  add column activated_at timestamptz,
  add column completed_at timestamptz,
  add constraint ai_change_sets_scope_shape check (
    scope_kind is null
    or (scope_kind = 'single_object' and cardinality(scope_object_ids) = 1)
    or (scope_kind = 'explicit_context' and cardinality(scope_object_ids) >= 2)
    or (scope_kind = 'world_space' and cardinality(scope_object_ids) = 0)
  );

alter table public.ai_object_changes
  add column what_changed text check (what_changed is null or char_length(what_changed) between 1 and 2000),
  add column why text check (why is null or char_length(why) between 1 and 4000),
  add column review_status text not null default 'pending' check (review_status in ('pending', 'activated', 'kept', 'discarded', 'revision_requested', 'conflicted')),
  add column conflict_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(conflict_metadata) = 'object'),
  add column result_sequence bigint check (result_sequence is null or result_sequence > 0);

alter table public.review_decisions
  add column idempotency_key uuid,
  add column result_sequence bigint check (result_sequence is null or result_sequence > 0),
  add column child_run_id uuid references public.ai_runs (id) on delete set null;

alter table public.review_decisions
  drop constraint review_decisions_object_change_id_reviewer_id_key;

create unique index review_decisions_object_change_unique_idx
  on public.review_decisions (object_change_id);

create unique index review_decisions_reviewer_idempotency_idx
  on public.review_decisions (reviewer_id, idempotency_key)
  where idempotency_key is not null;

alter table public.stories
  add column kind text not null default 'general' check (kind in ('general', 'review')),
  add column review_change_set_id uuid references public.ai_change_sets (id) on delete cascade;

create unique index stories_review_change_set_unique_idx
  on public.stories (review_change_set_id)
  where review_change_set_id is not null;

alter table public.stories
  add constraint stories_review_kind_shape check (
    (kind = 'general' and review_change_set_id is null)
    or (kind = 'review' and review_change_set_id is not null)
  );

alter table public.story_scenes
  add column object_change_id uuid references public.ai_object_changes (id) on delete cascade;

create unique index story_scenes_object_change_unique_idx
  on public.story_scenes (object_change_id)
  where object_change_id is not null;

drop policy stories_insert on public.stories;
create policy stories_insert on public.stories for insert to authenticated
  with check (
    kind = 'general'
    and review_change_set_id is null
    and author_id = auth.uid()
    and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[])
  );

drop policy stories_update on public.stories;
create policy stories_update on public.stories for update to authenticated
  using (
    kind = 'general'
    and review_change_set_id is null
    and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[])
  )
  with check (
    kind = 'general'
    and review_change_set_id is null
    and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[])
  );

drop policy stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated
  using (
    kind = 'general'
    and review_change_set_id is null
    and private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[])
  );

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
  target_change_set public.ai_change_sets%rowtype;
  target_run public.ai_runs%rowtype;
  target_comment public.comments%rowtype;
  expected_scope_kind text;
  expected_scope_ids uuid[];
  affected_ids uuid[];
  explanation_ids uuid[];
  explanation_item jsonb;
  explanation_object_id uuid;
  next_fingerprint text;
  next_story_id uuid := extensions.gen_random_uuid();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  target_summary := btrim(target_summary);
  if target_requester_id is null or target_summary is null
    or char_length(target_summary) not between 1 and 10000 then
    raise exception 'Review finalization identity and summary are invalid.' using errcode = '22023';
  end if;
  if target_explanations is null or jsonb_typeof(target_explanations) <> 'array'
    or jsonb_array_length(target_explanations) not between 1 and 1000 then
    raise exception 'Review explanations must be a bounded array.' using errcode = '22023';
  end if;
  if target_visual_feedback_metadata is null
    or jsonb_typeof(target_visual_feedback_metadata) <> 'object'
    or octet_length(convert_to(target_visual_feedback_metadata::text, 'utf8')) > 10000
    or target_visual_feedback_metadata::text ilike '%data:image%'
    or target_visual_feedback_metadata::text ilike '%base64,%' then
    raise exception 'Visual feedback metadata is invalid or contains image content.' using errcode = '22023';
  end if;

  select * into target_change_set
  from public.ai_change_sets change_set
  where change_set.id = target_change_set_id
  for update;
  if not found or target_change_set.ai_run_id is null
    or target_change_set.requested_by <> target_requester_id then
    raise exception 'AI review stage is not accessible.' using errcode = '42501';
  end if;
  select * into target_run
  from public.ai_runs run
  where run.id = target_change_set.ai_run_id
    and run.canvas_id = target_change_set.canvas_id
    and run.requested_by = target_requester_id;
  if not found then
    raise exception 'AI review run is not accessible.' using errcode = '42501';
  end if;
  select * into target_comment
  from public.comments comment
  where comment.id = target_run.invoking_comment_id
    and comment.canvas_id = target_change_set.canvas_id;
  if not found or target_comment.status <> 'open' then
    raise exception 'The source comment is no longer open.' using errcode = '22023';
  end if;

  expected_scope_ids := coalesce(target_run.ordered_context_ids, array[]::uuid[]);
  if cardinality(expected_scope_ids) = 0 then
    select coalesce(array_agg(target.target_object_id order by target.target_order), array[]::uuid[])
    into expected_scope_ids
    from public.comment_targets target
    where target.comment_id = target_comment.id;
  end if;
  expected_scope_kind := case
    when cardinality(expected_scope_ids) = 1 then 'single_object'
    when cardinality(expected_scope_ids) > 1 then 'explicit_context'
    when target_comment.anchor_x is not null and target_comment.anchor_y is not null then 'world_space'
    else null
  end;
  if expected_scope_kind is null
    or target_scope_kind is distinct from expected_scope_kind
    or coalesce(target_scope_object_ids, array[]::uuid[]) is distinct from expected_scope_ids then
    raise exception 'Review scope does not match the persisted source comment.' using errcode = '42501';
  end if;

  select array_agg(object_change.object_id order by object_change.object_id)
  into affected_ids
  from public.ai_object_changes object_change
  where object_change.change_set_id = target_change_set.id;
  if cardinality(coalesce(affected_ids, array[]::uuid[])) = 0 then
    raise exception 'Review stage has no object changes.' using errcode = '22023';
  end if;
  if expected_scope_kind <> 'world_space' and exists (
    select 1 from unnest(affected_ids) affected_id
    where not affected_id = any(expected_scope_ids)
  ) then
    raise exception 'Review changes exceed the persisted comment scope.' using errcode = '42501';
  end if;
  if expected_scope_kind = 'single_object' and (
    affected_ids <> expected_scope_ids
    or exists (
      select 1 from public.ai_object_changes object_change
      where object_change.change_set_id = target_change_set.id
        and object_change.before_state -> 'object' = 'null'::jsonb
    )
  ) then
    raise exception 'A single-object comment can change only its existing target.' using errcode = '42501';
  end if;

  explanation_ids := array[]::uuid[];
  for explanation_item in select value from jsonb_array_elements(target_explanations)
  loop
    if jsonb_typeof(explanation_item) <> 'object'
      or explanation_item - array['objectId', 'whatChanged', 'why'] <> '{}'::jsonb
      or not explanation_item ?& array['objectId', 'whatChanged', 'why'] then
      raise exception 'A review explanation has invalid fields.' using errcode = '22023';
    end if;
    begin
      explanation_object_id := (explanation_item ->> 'objectId')::uuid;
    exception when invalid_text_representation then
      raise exception 'A review explanation object identity is invalid.' using errcode = '22023';
    end;
    if explanation_object_id = any(explanation_ids)
      or char_length(btrim(explanation_item ->> 'whatChanged')) not between 1 and 2000
      or char_length(btrim(explanation_item ->> 'why')) not between 1 and 4000 then
      raise exception 'Review explanations must be unique and non-empty.' using errcode = '22023';
    end if;
    explanation_ids := array_append(explanation_ids, explanation_object_id);
  end loop;
  select array_agg(id order by id) into explanation_ids from unnest(explanation_ids) id;
  if explanation_ids is distinct from affected_ids then
    raise exception 'Review explanations must exactly match affected objects.' using errcode = '22023';
  end if;

  next_fingerprint := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'summary', target_summary,
        'explanations', target_explanations,
        'scopeKind', target_scope_kind,
        'scopeObjectIds', target_scope_object_ids,
        'visualFeedbackMetadata', target_visual_feedback_metadata
      )::text, 'utf8'),
      'sha256'
    ),
    'hex'
  );
  if target_change_set.finalization_fingerprint is not null then
    if target_change_set.finalization_fingerprint <> next_fingerprint then
      raise exception 'Review stage finalization was reused with different content.' using errcode = '23505';
    end if;
    return query select target_change_set.id, cardinality(affected_ids), false;
    return;
  end if;

  update public.ai_change_sets
  set source_comment_id = target_comment.id,
      scope_kind = target_scope_kind,
      scope_object_ids = target_scope_object_ids,
      summary = target_summary,
      finalization_fingerprint = next_fingerprint,
      visual_feedback_metadata = target_visual_feedback_metadata,
      updated_at = now()
  where id = target_change_set.id;

  update public.ai_object_changes object_change
  set what_changed = btrim(explanation_row.value ->> 'whatChanged'),
      why = btrim(explanation_row.value ->> 'why'),
      explanation = concat_ws(
        E'\n\n',
        btrim(explanation_row.value ->> 'whatChanged'),
        btrim(explanation_row.value ->> 'why')
      )
  from jsonb_array_elements(target_explanations) as explanation_row(value)
  where object_change.change_set_id = target_change_set.id
    and object_change.object_id = (explanation_row.value ->> 'objectId')::uuid;

  insert into public.stories (
    id, canvas_id, author_id, title, kind, review_change_set_id
  ) values (
    next_story_id,
    target_change_set.canvas_id,
    target_requester_id,
    left(target_summary, 500),
    'review',
    target_change_set.id
  );

  insert into public.story_scenes (
    story_id, position, target, camera, narration, object_change_id
  )
  select
    next_story_id,
    (row_number() over (order by object_change.created_at, object_change.id) - 1)::integer,
    jsonb_build_object(
      'objectId', object_change.object_id,
      'beforeBounds', object_change.before_state #> '{object,geometry}',
      'afterBounds', object_change.after_state #> '{object,geometry}'
    ),
    jsonb_build_object(
      'mode', 'fit',
      'padding', 64,
      'preferredState', case
        when object_change.after_state -> 'object' <> 'null'::jsonb then 'after'
        else 'before'
      end
    ),
    concat_ws(E'\n\n', object_change.what_changed, object_change.why),
    object_change.id
  from public.ai_object_changes object_change
  where object_change.change_set_id = target_change_set.id;

  return query select target_change_set.id, cardinality(affected_ids), true;
end;
$$;

revoke all on function public.finalize_ai_review_stage(
  uuid, uuid, text, jsonb, text, uuid[], jsonb
) from public, anon, authenticated;

grant execute on function public.finalize_ai_review_stage(
  uuid, uuid, text, jsonb, text, uuid[], jsonb
) to service_role;

create function public.activate_ai_review_stage(
  target_change_set_id uuid,
  target_requester_id uuid,
  target_update_data bytea,
  target_expected_sequence bigint
)
returns table (sequence bigint, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_change_set public.ai_change_sets%rowtype;
  target_run public.ai_runs%rowtype;
  target_comment public.comments%rowtype;
  current_sequence bigint;
  next_sequence bigint;
  existing_update public.canvas_updates%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_requester_id is null or target_update_data is null
    or octet_length(target_update_data) = 0 or target_expected_sequence < 0 then
    raise exception 'Review activation input is invalid.' using errcode = '22023';
  end if;

  select * into target_change_set
  from public.ai_change_sets change_set
  where change_set.id = target_change_set_id
  for update;
  if not found or target_change_set.ai_run_id is null
    or target_change_set.source_comment_id is null
    or target_change_set.requested_by <> target_requester_id
    or target_change_set.finalization_fingerprint is null then
    raise exception 'AI review stage is not accessible.' using errcode = '42501';
  end if;

  if not coalesce(
    private.canvas_role(target_change_set.canvas_id, target_requester_id)
      = any(array['owner', 'editor']::public.canvas_role[]),
    false
  ) then
    raise exception 'Canvas review activation is no longer permitted.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.canvas_ai_settings settings
    where settings.canvas_id = target_change_set.canvas_id
      and settings.enabled
      and settings.authority in ('edit_with_review', 'trusted_editor')
  ) then
    raise exception 'Current AI authority no longer allows review activation.' using errcode = '42501';
  end if;
  select * into target_run from public.ai_runs run
  where run.id = target_change_set.ai_run_id;
  select * into target_comment from public.comments comment
  where comment.id = target_change_set.source_comment_id
    and comment.canvas_id = target_change_set.canvas_id;
  if target_run.id is null or target_comment.id is null
    or target_comment.status <> 'open'
    or target_change_set.scope_kind is null
    or target_change_set.scope_kind <> (case
      when cardinality(target_run.ordered_context_ids) = 1 then 'single_object'
      when cardinality(target_run.ordered_context_ids) > 1 then 'explicit_context'
      when target_comment.anchor_x is not null and target_comment.anchor_y is not null then 'world_space'
      else null
    end)
    or target_change_set.scope_object_ids <> coalesce(target_run.ordered_context_ids, array[]::uuid[])
    or (
      target_change_set.scope_kind <> 'world_space'
      and exists (
        select 1 from public.ai_object_changes object_change
        where object_change.change_set_id = target_change_set.id
          and not (object_change.object_id = any(target_change_set.scope_object_ids))
      )
    ) then
    raise exception 'Review activation no longer matches its source comment scope.' using errcode = '42501';
  end if;

  if target_change_set.activation_sequence is not null then
    select * into existing_update
    from public.canvas_updates canvas_update
    where canvas_update.canvas_id = target_change_set.canvas_id
      and canvas_update.sequence = target_change_set.activation_sequence;
    if not found or existing_update.update_data <> target_update_data then
      raise exception 'Review activation was reused with different content.' using errcode = '23505';
    end if;
    return query select target_change_set.activation_sequence, false;
    return;
  end if;

  if target_change_set.status <> 'pending' then
    raise exception 'AI review stage is not pending activation.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_change_set.canvas_id::text, 0));
  select greatest(
    coalesce((select max(snapshot.last_sequence) from public.canvas_snapshots snapshot where snapshot.canvas_id = target_change_set.canvas_id), 0),
    coalesce((select max(canvas_update.sequence) from public.canvas_updates canvas_update where canvas_update.canvas_id = target_change_set.canvas_id), 0)
  ) into current_sequence;
  if current_sequence <> target_expected_sequence then
    raise exception 'The canvas changed before tentative review activation.' using errcode = '40001';
  end if;
  next_sequence := current_sequence + 1;

  insert into public.canvas_updates (
    canvas_id, sequence, update_data, actor_id, client_update_id
  ) values (
    target_change_set.canvas_id,
    next_sequence,
    target_update_data,
    target_requester_id,
    target_change_set.id
  );

  update public.ai_change_sets
  set status = 'applied',
      activation_sequence = next_sequence,
      activated_at = now(),
      updated_at = now()
  where id = target_change_set.id;

  update public.ai_object_changes
  set review_status = 'activated', result_sequence = next_sequence
  where change_set_id = target_change_set.id;

  return query select next_sequence, true;
end;
$$;

revoke all on function public.activate_ai_review_stage(
  uuid, uuid, bytea, bigint
) from public, anon, authenticated;

grant execute on function public.activate_ai_review_stage(
  uuid, uuid, bytea, bigint
) to service_role;

create function public.decide_ai_review_object(
  target_object_change_id uuid,
  target_reviewer_id uuid,
  target_decision public.review_decision_kind,
  target_note text,
  target_idempotency_key uuid,
  target_update_data bytea,
  target_expected_sequence bigint,
  target_conflicts jsonb default '[]'::jsonb
)
returns table (
  decision_id uuid,
  result_sequence bigint,
  review_status text,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_object_change public.ai_object_changes%rowtype;
  target_change_set public.ai_change_sets%rowtype;
  existing_decision public.review_decisions%rowtype;
  next_decision_id uuid := extensions.gen_random_uuid();
  current_sequence bigint;
  next_sequence bigint;
  next_review_status text;
  pending_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  if target_reviewer_id is null or target_idempotency_key is null
    or target_decision not in ('keep', 'discard', 'revise')
    or target_conflicts is null or jsonb_typeof(target_conflicts) <> 'array'
    or octet_length(convert_to(target_conflicts::text, 'utf8')) > 10000 then
    raise exception 'Review decision input is invalid.' using errcode = '22023';
  end if;
  target_note := nullif(btrim(target_note), '');
  if octet_length(target_update_data) = 0 then
    target_update_data := null;
  end if;
  if target_expected_sequence < 0 then
    target_expected_sequence := null;
  end if;
  if target_note is not null and char_length(target_note) > 10000 then
    raise exception 'Review decision note is too long.' using errcode = '22023';
  end if;
  if target_decision = 'revise' and target_note is null then
    raise exception 'A revision request requires guidance.' using errcode = '22023';
  end if;

  select * into target_object_change
  from public.ai_object_changes object_change
  where object_change.id = target_object_change_id;
  if not found then
    raise exception 'Review object is not accessible.' using errcode = '42501';
  end if;
  select * into target_change_set
  from public.ai_change_sets change_set
  where change_set.id = target_object_change.change_set_id
  for update;
  if not found or target_change_set.ai_run_id is null then
    raise exception 'Review change set is not accessible.' using errcode = '42501';
  end if;
  if not coalesce(
    private.canvas_role(target_change_set.canvas_id, target_reviewer_id)
      = any(array['owner', 'editor']::public.canvas_role[]),
    false
  ) then
    raise exception 'Only a current owner or editor may decide AI changes.' using errcode = '42501';
  end if;

  select * into existing_decision
  from public.review_decisions decision
  where decision.reviewer_id = target_reviewer_id
    and decision.idempotency_key = target_idempotency_key;
  if found then
    if existing_decision.object_change_id <> target_object_change_id
      or existing_decision.decision <> target_decision
      or existing_decision.note is distinct from target_note then
      raise exception 'Review decision identity was reused with different content.' using errcode = '23505';
    end if;
    return query select
      existing_decision.id,
      existing_decision.result_sequence,
      target_object_change.review_status,
      false;
    return;
  end if;

  select * into existing_decision
  from public.review_decisions decision
  where decision.object_change_id = target_object_change_id;
  if found then
    raise exception 'Another collaborator already decided this object.' using errcode = '40001';
  end if;

  if target_change_set.status not in ('applied', 'partially_reviewed')
    or target_change_set.activation_sequence is null then
    raise exception 'Review change set is not active.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_change_set.canvas_id::text, 0));
  select greatest(
    coalesce((select max(snapshot.last_sequence) from public.canvas_snapshots snapshot where snapshot.canvas_id = target_change_set.canvas_id), 0),
    coalesce((select max(canvas_update.sequence) from public.canvas_updates canvas_update where canvas_update.canvas_id = target_change_set.canvas_id), 0)
  ) into current_sequence;
  if target_expected_sequence is not null and current_sequence <> target_expected_sequence then
    raise exception 'The canvas changed before the review decision.' using errcode = '40001';
  end if;

  next_sequence := current_sequence;
  if target_update_data is not null then
    if octet_length(target_update_data) = 0 or target_decision = 'keep' then
      raise exception 'Review decision update is invalid.' using errcode = '22023';
    end if;
    next_sequence := current_sequence + 1;
    insert into public.canvas_updates (
      canvas_id, sequence, update_data, actor_id, client_update_id
    ) values (
      target_change_set.canvas_id,
      next_sequence,
      target_update_data,
      target_reviewer_id,
      target_idempotency_key
    );
  end if;

  next_review_status := case
    when jsonb_array_length(target_conflicts) > 0 then 'conflicted'
    when target_decision = 'keep' then 'kept'
    when target_decision = 'discard' then 'discarded'
    else 'revision_requested'
  end;
  insert into public.review_decisions (
    id, object_change_id, reviewer_id, decision, note,
    idempotency_key, result_sequence
  ) values (
    next_decision_id,
    target_object_change_id,
    target_reviewer_id,
    target_decision,
    target_note,
    target_idempotency_key,
    next_sequence
  );
  update public.ai_object_changes
  set review_status = next_review_status,
      conflict_metadata = jsonb_build_object('paths', target_conflicts),
      result_sequence = next_sequence
  where id = target_object_change_id;

  select count(*) into pending_count
  from public.ai_object_changes object_change
  where object_change.change_set_id = target_change_set.id
    and object_change.review_status in ('pending', 'activated');
  update public.ai_change_sets
  set status = (
        case when pending_count = 0 then 'complete' else 'partially_reviewed' end
      )::public.ai_change_status,
      completed_at = case when pending_count = 0 then now() else null end,
      updated_at = now()
  where id = target_change_set.id;

  return query select next_decision_id, next_sequence, next_review_status, true;
end;
$$;

revoke all on function public.decide_ai_review_object(
  uuid, uuid, public.review_decision_kind, text, uuid, bytea, bigint, jsonb
) from public, anon, authenticated;

grant execute on function public.decide_ai_review_object(
  uuid, uuid, public.review_decision_kind, text, uuid, bytea, bigint, jsonb
) to service_role;

create function public.link_ai_review_revision(
  target_decision_id uuid,
  target_reviewer_id uuid,
  target_child_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_decision public.review_decisions%rowtype;
  target_change_set public.ai_change_sets%rowtype;
  target_child_run public.ai_runs%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization is required.' using errcode = '42501';
  end if;
  select decision.* into target_decision
  from public.review_decisions decision
  where decision.id = target_decision_id
  for update;
  if not found or target_decision.reviewer_id <> target_reviewer_id
    or target_decision.decision <> 'revise' then
    raise exception 'Revision decision is not accessible.' using errcode = '42501';
  end if;
  select change_set.* into target_change_set
  from public.ai_object_changes object_change
  join public.ai_change_sets change_set on change_set.id = object_change.change_set_id
  where object_change.id = target_decision.object_change_id;
  select * into target_child_run
  from public.ai_runs run
  where run.id = target_child_run_id
    and run.canvas_id = target_change_set.canvas_id
    and run.requested_by = target_reviewer_id
    and run.invoking_comment_id = target_change_set.source_comment_id;
  if not found then
    raise exception 'Revision AI run does not belong to this review thread.' using errcode = '42501';
  end if;
  if target_decision.child_run_id is not null
    and target_decision.child_run_id <> target_child_run_id then
    raise exception 'Revision decision is already linked to another run.' using errcode = '23505';
  end if;
  update public.review_decisions
  set child_run_id = target_child_run_id, updated_at = now()
  where id = target_decision.id;
end;
$$;

revoke all on function public.link_ai_review_revision(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.link_ai_review_revision(uuid, uuid, uuid)
  to service_role;
