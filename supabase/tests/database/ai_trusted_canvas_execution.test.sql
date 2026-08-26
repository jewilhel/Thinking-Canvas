begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.execute_ai_canvas_commands(uuid,uuid,text,uuid,bytea,uuid[],bigint)',
    'EXECUTE'
  ),
  'authenticated clients cannot forge the server-only trusted canvas executor'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_ai_canvas_execution_retry(uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot inspect the server-only trusted retry payload'
);

select results_eq(
  $$select authority::text, version
    from public.set_canvas_ai_settings(
      '20000000-0000-4000-8000-000000000001', true, 'trusted_editor', 0
    )$$,
  $$values ('trusted_editor'::text, 1::bigint)$$,
  'the owner explicitly enables trusted-editor authority'
);

select results_eq(
  $$select created, ai_run_id is not null
    from public.create_comment_thread(
      target_canvas_id => '20000000-0000-4000-8000-000000000001',
      target_client_command_id => '89000000-0000-4000-8000-000000000001',
      target_body => 'Apply this validated canvas change.',
      target_anchor_x => 100,
      target_anchor_y => 120,
      target_include_primary_ai => true
    )$$,
  $$values (true, true)$$,
  'an addressed comment creates the accountable trusted-editor run'
);

select results_eq(
  $$select status::text from public.start_ai_run(
      (select id from public.ai_runs
       where idempotency_key = '89000000-0000-4000-8000-000000000001')
    )$$,
  $$values ('projecting'::text)$$,
  'the requester starts the trusted-editor run'
);

select set_config(
  'test.trusted_run_id',
  (select id::text from public.ai_runs
   where idempotency_key = '89000000-0000-4000-8000-000000000001'),
  true
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select sequence, created
    from public.execute_ai_canvas_commands(
      current_setting('test.trusted_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'trusted-execution-1',
      '89000000-0000-5000-8000-000000000002',
      decode('010203', 'hex'),
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      0
    )$$,
  $$values (1::bigint, true)$$,
  'trusted execution atomically persists one canonical update'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select status::text, authority_snapshot::text
    from public.ai_runs where id = current_setting('test.trusted_run_id')::uuid$$,
  $$values ('applying'::text, 'trusted_editor'::text)$$,
  'the run exposes applying status with its current authority snapshot'
);

select results_eq(
  $$select update.actor_id, update.client_update_id, execution.tool_name,
      execution.outcome::text, execution.affected_object_ids
    from public.canvas_updates update
    join public.ai_tool_executions execution
      on execution.command_id = update.client_update_id
    where execution.run_id = current_setting('test.trusted_run_id')::uuid$$,
  $$values (
    '10000000-0000-4000-8000-000000000001'::uuid,
    '89000000-0000-5000-8000-000000000002'::uuid,
    'execute_canvas_commands'::text,
    'succeeded'::text,
    array['61000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'the update attributes the primary AI action to its accountable requester and audit record'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select sequence, created
    from public.execute_ai_canvas_commands(
      current_setting('test.trusted_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'trusted-execution-1',
      '89000000-0000-5000-8000-000000000002',
      decode('010203', 'hex'),
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      0
    )$$,
  $$values (1::bigint, false)$$,
  'an exact trusted execution retry returns the acknowledged sequence without duplication'
);

select results_eq(
  $$select sequence, encode(update_data, 'hex'), affected_object_ids
    from public.get_ai_canvas_execution_retry(
      current_setting('test.trusted_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'trusted-execution-1',
      '89000000-0000-5000-8000-000000000002'
    )$$,
  $$values (
    1::bigint,
    '010203'::text,
    array['61000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'the server can resume Broadcast from the exact durable retry payload'
);

select throws_ok(
  $$select * from public.execute_ai_canvas_commands(
      current_setting('test.trusted_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'trusted-execution-1',
      '89000000-0000-5000-8000-000000000002',
      decode('010204', 'hex'),
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      0
    )$$,
  '23505',
  'The tool call identity was reused with different or incomplete work.',
  'a changed-content call-key retry fails closed'
);

select throws_ok(
  $$select * from public.execute_ai_canvas_commands(
      current_setting('test.trusted_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'trusted-execution-stale',
      '89000000-0000-5000-8000-000000000003',
      decode('050607', 'hex'),
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      0
    )$$,
  '40001',
  'The canvas changed after the AI projection was built.',
  'a stale projection cannot partially append another update'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select authority::text, version
    from public.set_canvas_ai_settings(
      '20000000-0000-4000-8000-000000000001', true, 'propose_changes', 1
    )$$,
  $$values ('propose_changes'::text, 2::bigint)$$,
  'the owner can downgrade authority while a run exists'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$select * from public.execute_ai_canvas_commands(
      current_setting('test.trusted_run_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      'trusted-execution-after-downgrade',
      '89000000-0000-5000-8000-000000000004',
      decode('08090a', 'hex'),
      array['61000000-0000-4000-8000-000000000001']::uuid[],
      1
    )$$,
  '42501',
  'Current AI authority does not allow canonical canvas changes.',
  'lower authority cannot mutate canonical state even through the server RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.canvas_updates
   where canvas_id = '20000000-0000-4000-8000-000000000001'),
  1,
  'stale, colliding, and downgraded attempts leave no partial updates'
);

select results_eq(
  $$select status::text from public.complete_fake_ai_run(
      current_setting('test.trusted_run_id')::uuid,
      'I applied one validated canvas command.',
      'fake-trusted-request-1',
      '{"version":1,"trustedExecutionCount":1}'::jsonb
    )$$,
  $$values ('completed'::text)$$,
  'an applying trusted-editor run completes in the originating comment conversation'
);

select * from finish();
rollback;
