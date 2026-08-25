begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

set local role authenticated;

select ok(
  not has_table_privilege('authenticated', 'public.canvas_ai_settings', 'INSERT'),
  'authenticated clients cannot insert AI settings directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.ai_runs', 'INSERT'),
  'authenticated clients cannot insert AI runs directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.comment_message_recipients', 'INSERT'),
  'authenticated clients cannot forge comment recipients directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.execute_ai_contextual_comment(uuid,uuid,text,text,uuid[],bigint)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the server-only contextual comment executor directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_ai_canvas_proposal(uuid,uuid,text,uuid[],bigint)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the server-only proposal recorder directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.stage_ai_canvas_changes(uuid,uuid,text,text,jsonb,bigint)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the server-only review-stage transaction directly'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select enabled, configured_authority::text, effective_authority::text, can_manage, version
    from public.get_canvas_ai_access('20000000-0000-4000-8000-000000000001')$$,
  $$values (false, 'comment_only'::text, null::text, true, 0::bigint)$$,
  'an owner sees secure disabled defaults before a settings row exists'
);

select results_eq(
  $$select enabled, authority::text, version, changed_by
    from public.set_canvas_ai_settings(
      '20000000-0000-4000-8000-000000000001',
      true,
      'propose_changes',
      0
    )$$,
  $$values (
    true,
    'propose_changes'::text,
    1::bigint,
    '10000000-0000-4000-8000-000000000001'::uuid
  )$$,
  'the canvas owner enables the primary AI with an optimistic first version'
);

select throws_ok(
  $$select * from public.set_canvas_ai_settings(
    '20000000-0000-4000-8000-000000000001',
    true,
    'trusted_editor',
    0
  )$$,
  '40001',
  'AI settings changed since they were loaded.',
  'stale settings mutations fail instead of widening authority'
);

select results_eq(
  $$select authority::text, version
    from public.set_canvas_ai_settings(
      '20000000-0000-4000-8000-000000000001',
      true,
      'trusted_editor',
      1
    )$$,
  $$values ('trusted_editor'::text, 2::bigint)$$,
  'the owner advances settings with the current version'
);

select results_eq(
  $$select configured_authority::text, effective_authority::text, can_manage
    from public.get_canvas_ai_access('20000000-0000-4000-8000-000000000001')$$,
  $$values ('trusted_editor'::text, 'trusted_editor'::text, true)$$,
  'the owner receives the configured authority and management capability'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select * from public.set_canvas_ai_settings(
    '20000000-0000-4000-8000-000000000001',
    false,
    'comment_only',
    2
  )$$,
  '42501',
  'Changing AI settings is not permitted.',
  'an editor cannot change AI settings'
);

select results_eq(
  $$select effective_authority::text, can_manage
    from public.get_canvas_ai_access('20000000-0000-4000-8000-000000000001')$$,
  $$values ('trusted_editor'::text, false)$$,
  'an editor may invoke the configured authority without managing it'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_thread(
      '20000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000020',
      'Inspect this ordered selection.',
      array[
        '61000000-0000-4000-8000-000000000002',
        '61000000-0000-4000-8000-000000000001'
      ]::uuid[],
      null,
      'human',
      null,
      null,
      null,
      null,
      true,
      array[
        '61000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000002'
      ]::uuid[]
    )$$,
  $$values (true, true)$$,
  'an addressed object selection queues one AI run'
);

select results_eq(
  $$select target_object_id
    from public.comment_targets
    where comment_id = (
      select id from public.comments
      where client_command_id = '83000000-0000-4000-8000-000000000020'
    )
    order by target_order$$,
  $$values
    ('61000000-0000-4000-8000-000000000002'::uuid),
    ('61000000-0000-4000-8000-000000000001'::uuid)$$,
  'comment targets preserve the authors selection order'
);

select results_eq(
  $$select ordered_context_ids
    from public.ai_runs
    where idempotency_key = '83000000-0000-4000-8000-000000000020'$$,
  $$values (array[
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002'
  ]::uuid[])$$,
  'the queued AI run snapshots the exact ordered path independently of comment target order'
);

select throws_ok(
  $$select * from public.create_comment_thread(
    target_canvas_id => '20000000-0000-4000-8000-000000000001',
    target_client_command_id => '83000000-0000-4000-8000-000000000021',
    target_body => 'Reject a duplicate path.',
    target_anchor_x => 100,
    target_anchor_y => 120,
    target_include_primary_ai => true,
    target_ordered_context_ids => array[
      '61000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001'
    ]::uuid[]
  )$$,
  '22023',
  'Ordered AI context objects must be unique.',
  'direct callers cannot submit duplicate ordered path objects'
);

select results_eq(
  $$select effective_authority::text, can_manage
    from public.get_canvas_ai_access('20000000-0000-4000-8000-000000000001')$$,
  $$values ('comment_only'::text, false)$$,
  'a commenter is downgraded to comment-only invocation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);

select results_eq(
  $$select effective_authority::text, can_manage
    from public.get_canvas_ai_access('20000000-0000-4000-8000-000000000001')$$,
  $$values (null::text, false)$$,
  'a viewer cannot invoke or manage the AI'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);

select throws_ok(
  $$select * from public.get_canvas_ai_access('20000000-0000-4000-8000-000000000001')$$,
  '42501',
  'Canvas access is not permitted.',
  'a non-member cannot inspect AI access'
);

select is(
  (select count(*)::integer from public.canvas_ai_settings),
  0,
  'RLS hides AI settings from a non-member'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_thread(
      '20000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001',
      'Please inspect this canvas direction.',
      array[]::uuid[],
      null,
      'human',
      null,
      100,
      120,
      array['10000000-0000-4000-8000-000000000001']::uuid[],
      true
    )$$,
  $$values (true, true)$$,
  'a commenter atomically addresses a human and the enabled primary AI'
);

select results_eq(
  $$select authority_snapshot::text, status::text
    from public.ai_runs
    where idempotency_key = '83000000-0000-4000-8000-000000000001'$$,
  $$values ('comment_only'::text, 'queued'::text)$$,
  'a commenter AI run is queued with a comment-only authority snapshot'
);

select results_eq(
  $$select status::text
    from public.complete_fake_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000001'),
      'I inspected the durable canvas and authorized comment history.',
      'fake-request-1',
      '{"version":1,"objectCount":1,"commentThreadCount":1}'::jsonb
    )$$,
  $$values ('completed'::text)$$,
  'the requesting commenter may persist one deterministic AI reply through the server completion boundary'
);

select results_eq(
  $$select author_kind::text, author_key, body
    from public.comment_replies
    where client_command_id = (
      select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000001'
    )$$,
  $$values (
    'ai'::text,
    'primary-ai'::text,
    'I inspected the durable canvas and authorized comment history.'::text
  )$$,
  'the completed run stores visible output as an ordinary AI-authored comment reply'
);

select is(
  (
    select count(*)::integer from public.ai_runs
    where invoking_comment_id = (
      select id from public.comments
      where client_command_id = '83000000-0000-4000-8000-000000000001'
    )
  ),
  1,
  'persisting AI output does not recursively enqueue another AI run'
);

select results_eq(
  $$select reply_id, status::text
    from public.complete_fake_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000001'),
      'I inspected the durable canvas and authorized comment history.',
      'fake-request-1',
      '{"version":1,"objectCount":1,"commentThreadCount":1}'::jsonb
    )$$,
  $$select output_reply_id, 'completed'::text from public.ai_runs
    where idempotency_key = '83000000-0000-4000-8000-000000000001'$$,
  'an exact completion retry returns the existing AI reply without duplication'
);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_thread(
      target_canvas_id => '20000000-0000-4000-8000-000000000001',
      target_client_command_id => '83000000-0000-4000-8000-000000000040',
      target_body => 'Please leave a contextual comment on the evidence.',
      target_anchor_x => 160,
      target_anchor_y => 180,
      target_include_primary_ai => true
    )$$,
  $$values (true, true)$$,
  'a world-space request queues the run that may create a contextual comment'
);

select results_eq(
  $$select status::text
    from public.start_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000040')
    )$$,
  $$values ('projecting'::text)$$,
  'the contextual-comment run enters the server execution boundary'
);

select set_config(
  'test.contextual_run_id',
  (select id::text from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000040'),
  true
);
select set_config(
  'test.contextual_sequence',
  greatest(
    coalesce((select max(last_sequence) from public.canvas_snapshots where canvas_id = '20000000-0000-4000-8000-000000000001'), 0),
    coalesce((select max(sequence) from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'), 0)
  )::text,
  true
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select created
    from public.execute_ai_contextual_comment(
      current_setting('test.contextual_run_id')::uuid,
      '10000000-0000-4000-8000-000000000003',
      'contextual-comment-1',
      'Grounded observation on the evidence object.',
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      current_setting('test.contextual_sequence')::bigint
    )$$,
  $$values (true)$$,
  'a commenter may execute one server-validated comment-only contextual tool'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select comment.author_kind::text, comment.author_key, target.target_object_id
    from public.ai_tool_executions execution
    join public.comments comment on comment.id = execution.comment_id
    join public.comment_targets target on target.comment_id = comment.id
    where execution.run_id = (
      select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000040'
    ) and execution.call_key = 'contextual-comment-1'$$,
  $$values (
    'ai'::text,
    'primary-ai'::text,
    '61000000-0000-4000-8000-000000000001'::uuid
  )$$,
  'the tool creates an ordinary AI-authored comment anchored to its validated evidence'
);

select results_eq(
  $$select outcome::text, tool_name, affected_object_ids, comment_id is not null
    from public.ai_tool_executions
    where run_id = (
      select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000040'
    ) and call_key = 'contextual-comment-1'$$,
  $$values (
    'succeeded'::text,
    'create_contextual_comment'::text,
    array['61000000-0000-4000-8000-000000000001']::uuid[],
    true
  )$$,
  'the contextual comment retains a privacy-safe tool audit link to its originating run'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$select * from public.execute_ai_contextual_comment(
      current_setting('test.contextual_run_id')::uuid,
      '10000000-0000-4000-8000-000000000003',
      'contextual-comment-stale',
      'This stale projection must not create a comment.',
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      999999
    )$$,
  '40001',
  'The canvas changed after the AI projection was built.',
  'contextual comment execution fails closed on a stale durable projection'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select status::text
    from public.complete_fake_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000040'),
      'I left one linked contextual comment on the supporting object.',
      'fake-request-contextual-1',
      '{"version":1,"contextualToolCount":1}'::jsonb
    )$$,
  $$values ('completed'::text)$$,
  'a run may complete in its originating thread after contextual tool execution'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select created
    from public.execute_ai_contextual_comment(
      current_setting('test.contextual_run_id')::uuid,
      '10000000-0000-4000-8000-000000000003',
      'contextual-comment-1',
      'Grounded observation on the evidence object.',
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      current_setting('test.contextual_sequence')::bigint
    )$$,
  $$values (false)$$,
  'an exact contextual tool retry returns the existing comment without duplication'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_thread(
      target_canvas_id => '20000000-0000-4000-8000-000000000001',
      target_client_command_id => '83000000-0000-4000-8000-000000000061',
      target_body => 'Stage this only if review authority is still current.',
      target_object_ids => array['61000000-0000-4000-8000-000000000001']::uuid[],
      target_include_primary_ai => true
    )$$,
  $$values (true, true)$$,
  'a second review run is queued before an authority downgrade'
);

select results_eq(
  $$select status::text
    from public.start_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000061')
    )$$,
  $$values ('projecting'::text)$$,
  'the authority-transition run is active before the settings change'
);

select set_config(
  'test.review_downgrade_run_id',
  (select id::text from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000061'),
  true
);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_thread(
      target_canvas_id => '20000000-0000-4000-8000-000000000001',
      target_client_command_id => '83000000-0000-4000-8000-000000000050',
      target_body => 'Propose moving the evidence object to the right.',
      target_object_ids => array['61000000-0000-4000-8000-000000000001']::uuid[],
      target_include_primary_ai => true
    )$$,
  $$values (true, true)$$,
  'an owner can queue an addressed request for a canvas proposal'
);

select results_eq(
  $$select status::text
    from public.start_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000050')
    )$$,
  $$values ('projecting'::text)$$,
  'the proposal run enters the server execution boundary'
);

select set_config(
  'test.proposal_run_id',
  (select id::text from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000050'),
  true
);
select set_config(
  'test.proposal_sequence',
  greatest(
    coalesce((select max(last_sequence) from public.canvas_snapshots where canvas_id = '20000000-0000-4000-8000-000000000001'), 0),
    coalesce((select max(sequence) from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'), 0)
  )::text,
  true
);
select set_config(
  'test.proposal_canvas_update_count',
  (select count(*)::text from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'),
  true
);
select set_config(
  'test.proposal_change_set_count',
  (select count(*)::text from public.ai_change_sets where canvas_id = '20000000-0000-4000-8000-000000000001'),
  true
);
select set_config(
  'test.proposal_object_change_count',
  (select count(*)::text from public.ai_object_changes),
  true
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select created
    from public.record_ai_canvas_proposal(
      current_setting('test.proposal_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'proposal-1',
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      current_setting('test.proposal_sequence')::bigint
    )$$,
  $$values (true)$$,
  'current owner authority records a validated non-mutating proposal tool outcome'
);

select throws_ok(
  $$select * from public.record_ai_canvas_proposal(
      current_setting('test.proposal_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'proposal-stale',
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      999999
    )$$,
  '40001',
  'The canvas changed after the AI projection was built.',
  'proposal recording fails closed on a stale durable projection'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select outcome::text, tool_name, affected_object_ids,
      command_id is null, comment_id is null, change_set_id is null
    from public.ai_tool_executions
    where run_id = current_setting('test.proposal_run_id')::uuid
      and call_key = 'proposal-1'$$,
  $$values (
    'succeeded'::text,
    'propose_canvas_commands'::text,
    array['61000000-0000-4000-8000-000000000001']::uuid[],
    true,
    true,
    true
  )$$,
  'the proposal audit stores affected identities without a command, comment, or review record'
);

select is(
  (select count(*)::bigint from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'),
  current_setting('test.proposal_canvas_update_count')::bigint,
  'recording a proposal does not mutate durable canvas updates'
);

select is(
  (select count(*)::bigint from public.ai_change_sets where canvas_id = '20000000-0000-4000-8000-000000000001'),
  current_setting('test.proposal_change_set_count')::bigint,
  'recording a proposal does not create an AI review change set'
);

select is(
  (select count(*)::bigint from public.ai_object_changes),
  current_setting('test.proposal_object_change_count')::bigint,
  'recording a proposal does not create per-object review records'
);

select results_eq(
  $$select status::text
    from public.complete_fake_ai_run(
      current_setting('test.proposal_run_id')::uuid,
      E'I prepared a validated proposal without changing the canvas.\n\nProposed changes (not applied):\n1. object.move — affected 61000000-0000-4000-8000-000000000001',
      'fake-request-proposal-1',
      '{"version":1,"proposalToolCount":1}'::jsonb
    )$$,
  $$values ('completed'::text)$$,
  'the validated proposal is returned as an ordinary AI reply in the originating thread'
);

select ok(
  (
    select body like '%Proposed changes (not applied):%object.move%'
    from public.comment_replies
    where client_command_id = current_setting('test.proposal_run_id')::uuid
  ),
  'the visible AI reply contains the ordered command proposal'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select created
    from public.record_ai_canvas_proposal(
      current_setting('test.proposal_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'proposal-1',
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      current_setting('test.proposal_sequence')::bigint
    )$$,
  $$values (false)$$,
  'an exact proposal tool retry returns its existing non-mutating audit record'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select authority::text, version
    from public.set_canvas_ai_settings(
      '20000000-0000-4000-8000-000000000001',
      true,
      'edit_with_review',
      2
    )$$,
  $$values ('edit_with_review'::text, 3::bigint)$$,
  'the owner explicitly selects review-stage authority for the next run'
);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_thread(
      target_canvas_id => '20000000-0000-4000-8000-000000000001',
      target_client_command_id => '83000000-0000-4000-8000-000000000060',
      target_body => 'Stage moving the evidence object to the right for review.',
      target_object_ids => array['61000000-0000-4000-8000-000000000001']::uuid[],
      target_include_primary_ai => true
    )$$,
  $$values (true, true)$$,
  'an owner can queue an addressed request for review staging'
);

select results_eq(
  $$select status::text
    from public.start_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000060')
    )$$,
  $$values ('projecting'::text)$$,
  'the review-stage run enters the server execution boundary'
);

select set_config(
  'test.review_run_id',
  (select id::text from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000060'),
  true
);
select set_config(
  'test.review_sequence',
  greatest(
    coalesce((select max(last_sequence) from public.canvas_snapshots where canvas_id = '20000000-0000-4000-8000-000000000001'), 0),
    coalesce((select max(sequence) from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'), 0)
  )::text,
  true
);
select set_config(
  'test.review_canvas_update_count',
  (select count(*)::text from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'),
  true
);
select set_config(
  'test.review_decision_count',
  (select count(*)::text from public.review_decisions),
  true
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select object_change_count, created
    from public.stage_ai_canvas_changes(
      current_setting('test.review_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'review-stage-1',
      'Move the supporting object to the right.',
      '[{
        "objectId":"61000000-0000-4000-8000-000000000001",
        "beforeState":{
          "object":{
            "id":"61000000-0000-4000-8000-000000000001",
            "canvasId":"20000000-0000-4000-8000-000000000001",
            "geometry":{"x":0,"y":0}
          },
          "orderIndex":0
        },
        "afterState":{
          "object":{
            "id":"61000000-0000-4000-8000-000000000001",
            "canvasId":"20000000-0000-4000-8000-000000000001",
            "geometry":{"x":40,"y":0}
          },
          "orderIndex":0
        },
        "affectedFields":["object.geometry.x"]
      }]'::jsonb,
      current_setting('test.review_sequence')::bigint
    )$$,
  $$values (1, true)$$,
  'current review authority stages one validated object change without applying it'
);

select throws_ok(
  $$select * from public.stage_ai_canvas_changes(
      current_setting('test.review_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'review-stage-stale',
      'This stale stage must not persist.',
      '[{
        "objectId":"61000000-0000-4000-8000-000000000001",
        "beforeState":{"object":{"id":"61000000-0000-4000-8000-000000000001","canvasId":"20000000-0000-4000-8000-000000000001"},"orderIndex":0},
        "afterState":{"object":{"id":"61000000-0000-4000-8000-000000000001","canvasId":"20000000-0000-4000-8000-000000000001"},"orderIndex":0},
        "affectedFields":["object.geometry.x"]
      }]'::jsonb,
      999999
    )$$,
  '40001',
  'The canvas changed after the AI projection was built.',
  'review staging fails closed on a stale durable projection'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select set_config(
  'test.review_change_set_id',
  (
    select change_set_id::text from public.ai_tool_executions
    where run_id = current_setting('test.review_run_id')::uuid
      and call_key = 'review-stage-1'
  ),
  true
);

select results_eq(
  $$select status::text, ai_run_id, tool_call_key, stage_fingerprint is not null
    from public.ai_change_sets
    where id = current_setting('test.review_change_set_id')::uuid$$,
  $$values (
    'pending'::text,
    current_setting('test.review_run_id')::uuid,
    'review-stage-1'::text,
    true
  )$$,
  'the staged change set retains pending run provenance and an idempotency fingerprint'
);

select results_eq(
  $$select object_id,
      before_state #>> '{object,geometry,x}',
      after_state #>> '{object,geometry,x}',
      affected_fields,
      explanation
    from public.ai_object_changes
    where change_set_id = current_setting('test.review_change_set_id')::uuid$$,
  $$values (
    '61000000-0000-4000-8000-000000000001'::uuid,
    '0'::text,
    '40'::text,
    array['object.geometry.x']::text[],
    'Move the supporting object to the right.'::text
  )$$,
  'review staging stores one before/after object record with affected fields'
);

select results_eq(
  $$select outcome::text, tool_name, affected_object_ids,
      command_id is null, comment_id is null,
      change_set_id = current_setting('test.review_change_set_id')::uuid
    from public.ai_tool_executions
    where run_id = current_setting('test.review_run_id')::uuid
      and call_key = 'review-stage-1'$$,
  $$values (
    'succeeded'::text,
    'stage_canvas_changes'::text,
    array['61000000-0000-4000-8000-000000000001']::uuid[],
    true,
    true,
    true
  )$$,
  'the privacy-safe tool audit links the run to its staged change set without a canvas command'
);

select is(
  (select count(*)::bigint from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'),
  current_setting('test.review_canvas_update_count')::bigint,
  'review staging does not mutate durable canvas updates'
);

select is(
  (select count(*)::bigint from public.review_decisions),
  current_setting('test.review_decision_count')::bigint,
  'review staging does not create Milestone 5 review decisions'
);

select results_eq(
  $$update public.ai_change_sets
    set status = 'applied'
    where id = current_setting('test.review_change_set_id')::uuid
    returning status::text$$,
  $$select 'applied'::text where false$$,
  'authenticated clients cannot relabel an AI-staged change set'
);

select throws_ok(
  $$insert into public.ai_change_sets (
      id, canvas_id, requested_by, status,
      ai_run_id, tool_call_key, stage_fingerprint
    ) values (
      '84000000-0000-4000-8000-000000000061',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'pending',
      current_setting('test.review_run_id')::uuid,
      'forged-browser-stage',
      repeat('0', 64)
    )$$,
  '42501',
  null,
  'authenticated clients cannot forge an AI-staged change set through table access'
);

select throws_ok(
  $$insert into public.ai_object_changes (
      id, change_set_id, object_id, before_state, after_state,
      affected_fields, explanation
    ) values (
      '84000000-0000-4000-8000-000000000062',
      current_setting('test.review_change_set_id')::uuid,
      '61000000-0000-4000-8000-000000000001',
      '{"object":{"id":"61000000-0000-4000-8000-000000000001"}}'::jsonb,
      '{"object":{"id":"61000000-0000-4000-8000-000000000001"}}'::jsonb,
      array['object.text'],
      'Forged browser object change.'
    )$$,
  '42501',
  null,
  'authenticated clients cannot append forged object records to an AI-staged change set'
);

select throws_ok(
  $$insert into public.review_decisions (
      object_change_id, reviewer_id, decision
    ) values (
      (
        select id from public.ai_object_changes
        where change_set_id = current_setting('test.review_change_set_id')::uuid
      ),
      '10000000-0000-4000-8000-000000000001',
      'keep'
    )$$,
  '42501',
  null,
  'authenticated clients cannot create a Milestone 5 decision for AI-staged work'
);

select results_eq(
  $$select status::text
    from public.complete_fake_ai_run(
      current_setting('test.review_run_id')::uuid,
      E'I staged validated changes for later review without changing the canvas.\n\nStaged for review (canvas unchanged):\n1. object.move — affected 61000000-0000-4000-8000-000000000001\n1 object change staged for later review.',
      'fake-request-review-stage-1',
      '{"version":1,"reviewStageToolCount":1}'::jsonb
    )$$,
  $$values ('completed'::text)$$,
  'the staged result is returned as an ordinary AI reply in the originating thread'
);

select ok(
  (
    select body like '%Staged for review (canvas unchanged):%object.move%'
    from public.comment_replies
    where client_command_id = current_setting('test.review_run_id')::uuid
  ),
  'the visible AI reply summarizes the staged command without review actions'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select object_change_count, created
    from public.stage_ai_canvas_changes(
      current_setting('test.review_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'review-stage-1',
      'Move the supporting object to the right.',
      '[{
        "objectId":"61000000-0000-4000-8000-000000000001",
        "beforeState":{"object":{"id":"61000000-0000-4000-8000-000000000001","canvasId":"20000000-0000-4000-8000-000000000001","geometry":{"x":0,"y":0}},"orderIndex":0},
        "afterState":{"object":{"id":"61000000-0000-4000-8000-000000000001","canvasId":"20000000-0000-4000-8000-000000000001","geometry":{"x":40,"y":0}},"orderIndex":0},
        "affectedFields":["object.geometry.x"]
      }]'::jsonb,
      current_setting('test.review_sequence')::bigint
    )$$,
  $$values (1, false)$$,
  'an exact review-stage retry returns the existing change set without duplication'
);

select throws_ok(
  $$select * from public.stage_ai_canvas_changes(
      current_setting('test.review_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'review-stage-1',
      'Different staged work under the same tool identity.',
      '[{
        "objectId":"61000000-0000-4000-8000-000000000001",
        "beforeState":{"object":{"id":"61000000-0000-4000-8000-000000000001","canvasId":"20000000-0000-4000-8000-000000000001"},"orderIndex":0},
        "afterState":{"object":{"id":"61000000-0000-4000-8000-000000000001","canvasId":"20000000-0000-4000-8000-000000000001"},"orderIndex":0},
        "affectedFields":["object.geometry.x"]
      }]'::jsonb,
      current_setting('test.review_sequence')::bigint
    )$$,
  '23505',
  'The tool call identity was reused with different or mutating work.',
  'a review-stage call-key collision fails instead of replacing staged work'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select authority::text, version
    from public.set_canvas_ai_settings(
      '20000000-0000-4000-8000-000000000001',
      true,
      'propose_changes',
      3
    )$$,
  $$values ('propose_changes'::text, 4::bigint)$$,
  'the owner can downgrade authority after a review stage completes'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$select * from public.stage_ai_canvas_changes(
      current_setting('test.review_downgrade_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'review-stage-after-downgrade',
      'This downgraded stage must not persist.',
      '[{
        "objectId":"61000000-0000-4000-8000-000000000001",
        "beforeState":{"object":{"id":"61000000-0000-4000-8000-000000000001","canvasId":"20000000-0000-4000-8000-000000000001"},"orderIndex":0},
        "afterState":{"object":{"id":"61000000-0000-4000-8000-000000000001","canvasId":"20000000-0000-4000-8000-000000000001"},"orderIndex":0},
        "affectedFields":["object.geometry.x"]
      }]'::jsonb,
      current_setting('test.review_sequence')::bigint
    )$$,
  '42501',
  'Current AI authority does not allow review staging.',
  'review staging rechecks current authority and fails closed after downgrade'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

select is(
  (
    select count(*)::integer
    from public.ai_runs child_run
    where child_run.invoking_comment_id in (
      select execution.comment_id
      from public.ai_tool_executions execution
      where execution.tool_name = 'create_contextual_comment'
    )
  ),
  0,
  'an AI-authored contextual root comment does not recursively invoke the AI'
);

select is(
  (
    select count(*)::integer
    from public.comment_thread_participants
    where comment_id = (
      select id from public.comments
      where client_command_id = '83000000-0000-4000-8000-000000000001'
    )
  ),
  3,
  'explicit routing stores the author, human recipient, and primary AI'
);

select results_eq(
  $$select created, ai_run_id
    from public.create_comment_thread(
      '20000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001',
      'Please inspect this canvas direction.',
      array[]::uuid[],
      null,
      'human',
      null,
      100,
      120,
      array['10000000-0000-4000-8000-000000000001']::uuid[],
      true
    )$$,
  $$select false, id from public.ai_runs
    where idempotency_key = '83000000-0000-4000-8000-000000000001'$$,
  'an exact addressed-comment retry returns the original AI run'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select created, ai_run_id
    from public.create_comment_reply(
      (select id from public.comments where client_command_id = '83000000-0000-4000-8000-000000000001'),
      '83000000-0000-4000-8000-000000000002',
      'AI response in the same conversation.',
      'ai',
      'primary-ai',
      array['10000000-0000-4000-8000-000000000003']::uuid[],
      false
    )$$,
  $$values (true, null::uuid)$$,
  'an AI-authored reply redirects to the requester without recursively enqueuing a run'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_reply(
      (select id from public.comments where client_command_id = '83000000-0000-4000-8000-000000000001'),
      '83000000-0000-4000-8000-000000000003',
      'Continue without another at-mention.'
    )$$,
  $$values (true, true)$$,
  'a human reply inherits the active AI conversation and enqueues one run'
);

select results_eq(
  $$select source::text, recipient_ai_key
    from public.comment_message_recipients
    where reply_id = (
      select id from public.comment_replies
      where client_command_id = '83000000-0000-4000-8000-000000000003'
    )$$,
  $$values ('inherited'::text, 'primary-ai'::text)$$,
  'the inherited turn snapshots the primary AI as its effective recipient'
);

select results_eq(
  $$select status::text, cancelled_at is not null
    from public.cancel_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000003')
    )$$,
  $$values ('cancelled'::text, true)$$,
  'the requester may cancel an in-flight inherited AI run'
);

select results_eq(
  $$select status::text, created
    from public.retry_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000003'),
      '83000000-0000-4000-8000-000000000013'
    )$$,
  $$values ('queued'::text, true)$$,
  'a cancelled run can create one retry against the same invoking turn'
);

select results_eq(
  $$select status::text, created
    from public.retry_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000003'),
      '83000000-0000-4000-8000-000000000013'
    )$$,
  $$values ('queued'::text, false)$$,
  'an exact retry command is idempotent'
);

select results_eq(
  $$select status::text
    from public.start_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000013')
    )$$,
  $$values ('projecting'::text)$$,
  'the server run boundary advances a queued retry into projection'
);

select results_eq(
  $$select status::text, error_code
    from public.fail_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000013'),
      'deterministic_failure'
    )$$,
  $$values ('failed'::text, 'deterministic_failure'::text)$$,
  'a server-observed failure records a privacy-safe error code'
);

select throws_ok(
  $$select * from public.cancel_ai_run(
    (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000013')
  )$$,
  '22023',
  'A finished AI run cannot be cancelled.',
  'a failed run cannot be relabeled as cancelled'
);

select results_eq(
  $$select created, ai_run_id
    from public.create_comment_reply(
      (select id from public.comments where client_command_id = '83000000-0000-4000-8000-000000000001'),
      '83000000-0000-4000-8000-000000000004',
      'Redirect this conversation to the owner.',
      'human',
      null,
      array['10000000-0000-4000-8000-000000000001']::uuid[],
      false
    )$$,
  $$values (true, null::uuid)$$,
  'an explicit human redirect replaces future routing without invoking the AI'
);

select is(
  (
    select count(*)::integer
    from public.comment_message_recipients
    where comment_id = (
      select id from public.comments
      where client_command_id = '83000000-0000-4000-8000-000000000001'
    )
      and recipient_ai_key = 'primary-ai'
  ),
  2,
  'redirecting later leaves earlier AI recipient history unchanged'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_thread(
      target_canvas_id => '20000000-0000-4000-8000-000000000001',
      target_client_command_id => '83000000-0000-4000-8000-000000000070',
      target_body => 'Propose only if my editor membership remains current.',
      target_object_ids => array['61000000-0000-4000-8000-000000000001']::uuid[],
      target_include_primary_ai => true
    )$$,
  $$values (true, true)$$,
  'an editor queues a proposal before membership removal'
);

select results_eq(
  $$select status::text
    from public.start_ai_run(
      (select id from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000070')
    )$$,
  $$values ('projecting'::text)$$,
  'the removed-member proposal reaches the execution boundary while membership is current'
);

select set_config(
  'test.removed_member_run_id',
  (select id::text from public.ai_runs where idempotency_key = '83000000-0000-4000-8000-000000000070'),
  true
);
select set_config(
  'test.removed_member_sequence',
  greatest(
    coalesce((select max(last_sequence) from public.canvas_snapshots where canvas_id = '20000000-0000-4000-8000-000000000001'), 0),
    coalesce((select max(sequence) from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'), 0)
  )::text,
  true
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

select lives_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000030',
    'A human-only conversation that will become stale.',
    array[]::uuid[],
    null,
    'human',
    null,
    180,
    220,
    array['10000000-0000-4000-8000-000000000002']::uuid[],
    false
  )$$,
  'a commenter can explicitly address a current human collaborator'
);

set local role postgres;
delete from public.canvas_members
where canvas_id = '20000000-0000-4000-8000-000000000001'
  and user_id = '10000000-0000-4000-8000-000000000002';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$select * from public.record_ai_canvas_proposal(
      current_setting('test.removed_member_run_id')::uuid,
      '10000000-0000-4000-8000-000000000002',
      'proposal-after-member-removal',
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      current_setting('test.removed_member_sequence')::bigint
    )$$,
  '42501',
  'Canvas proposal access is no longer permitted.',
  'proposal execution rechecks membership and fails closed after member removal'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

select throws_ok(
  $$select * from public.create_comment_reply(
    (select id from public.comments where client_command_id = '83000000-0000-4000-8000-000000000030'),
    '83000000-0000-4000-8000-000000000031',
    'This inherited reply must not route to a removed collaborator.'
  )$$,
  '42501',
  'An addressed collaborator is no longer available; redirect this conversation.',
  'inherited routing fails visibly when a human collaborator is removed'
);

set local role postgres;

insert into public.comment_thread_participants (
  comment_id,
  participant_kind,
  participant_user_id,
  routing_version
) values (
  '30000000-0000-4000-8000-000000000001',
  'human',
  '10000000-0000-4000-8000-000000000003',
  1
);

insert into public.comment_thread_participants (
  comment_id,
  participant_kind,
  participant_ai_key,
  routing_version
) values (
  '30000000-0000-4000-8000-000000000001',
  'ai',
  'primary-ai',
  1
);

insert into public.comment_message_recipients (
  comment_id,
  recipient_kind,
  recipient_ai_key,
  routing_version,
  source
) values (
  '30000000-0000-4000-8000-000000000001',
  'ai',
  'primary-ai',
  1,
  'explicit'
);

select throws_ok(
  $$insert into public.comment_thread_participants (
    comment_id, participant_kind, participant_ai_key, routing_version
  ) values (
    '30000000-0000-4000-8000-000000000001', 'ai', 'secondary-ai', 1
  )$$,
  '23514',
  null,
  'routing rejects any AI identity other than the primary AI'
);

select throws_ok(
  $$insert into public.comment_message_recipients (
    comment_id, recipient_kind, recipient_ai_key, routing_version, source
  ) values (
    '30000000-0000-4000-8000-000000000001', 'ai', 'primary-ai', 1, 'explicit'
  )$$,
  '23505',
  null,
  'one message cannot contain a duplicate AI recipient'
);

insert into public.ai_runs (
  id,
  canvas_id,
  invoking_comment_id,
  requested_by,
  idempotency_key,
  model,
  authority_snapshot,
  projection_metadata
) values (
  '80000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  '81000000-0000-4000-8000-000000000001',
  'fake-deterministic',
  'comment_only',
  '{"evidence":[{"objectId":"61000000-0000-4000-8000-000000000001","label":"Private label"}]}'::jsonb
);

insert into public.ai_tool_executions (
  id,
  run_id,
  call_key,
  tool_name,
  outcome
) values (
  '82000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  'call-1',
  'inspect_comment_threads',
  'succeeded'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);

select is(
  (
    select count(*)::integer from public.comment_thread_participants
    where comment_id = '30000000-0000-4000-8000-000000000001'
  ),
  2,
  'a canvas viewer may read conversation participants'
);

select is(
  (
    select count(*)::integer from public.ai_runs
    where id = '80000000-0000-4000-8000-000000000001'
  ),
  1,
  'a canvas viewer may read privacy-safe AI run status'
);

select is(
  (select count(*)::integer from public.ai_tool_executions),
  4,
  'a canvas viewer may read privacy-safe AI tool outcomes'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);

select is(
  (
    select count(*)::integer from public.comment_thread_participants
    where comment_id = '30000000-0000-4000-8000-000000000001'
  ),
  0,
  'a non-member cannot read conversation routing'
);

select is(
  (select count(*)::integer from public.ai_runs),
  0,
  'a non-member cannot read AI runs'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

select lives_ok(
  $$select public.delete_comment_thread('30000000-0000-4000-8000-000000000001')$$,
  'the comment author may permanently delete the routed thread'
);

select is(
  (
    select count(*)::integer from public.comment_thread_participants
    where comment_id = '30000000-0000-4000-8000-000000000001'
  ),
  0,
  'thread deletion cascades through active conversation participants'
);

select is(
  (
    select count(*)::integer from public.comment_message_recipients
    where comment_id = '30000000-0000-4000-8000-000000000001'
  ),
  0,
  'thread deletion cascades through immutable message recipients'
);

select results_eq(
  $$select invoking_comment_id, invoking_reply_id, status::text, error_code,
      projection_metadata ? 'evidence'
    from public.ai_runs where id = '80000000-0000-4000-8000-000000000001'$$,
  $$values (
    null::uuid,
    null::uuid,
    'cancelled'::text,
    'source_thread_deleted'::text,
    false
  )$$,
  'thread deletion cancels in-flight work and clears content-bearing linkage and evidence labels while retaining privacy-safe audit facts'
);

select * from finish();
rollback;
