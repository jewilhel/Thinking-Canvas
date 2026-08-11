begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

delete from public.canvas_updates
where canvas_id = '20000000-0000-4000-8000-000000000001';
delete from public.canvas_snapshots
where canvas_id = '20000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select sequence from public.append_canvas_update(
    '20000000-0000-4000-8000-000000000001', decode('01', 'hex'))$$,
  $$values (1::bigint)$$,
  'owner receives the first server-assigned sequence'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select sequence from public.append_canvas_update(
    '20000000-0000-4000-8000-000000000001', decode('02', 'hex'))$$,
  $$values (2::bigint)$$,
  'editor receives the next server-assigned sequence'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.append_canvas_update(
    '20000000-0000-4000-8000-000000000001', decode('03', 'hex'))$$,
  '42501',
  'canvas update is not permitted',
  'commenter cannot append a canvas update'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$select version, last_sequence, pruned_updates
    from public.publish_canvas_compaction(
      '20000000-0000-4000-8000-000000000001',
      2,
      decode('0102', 'hex'),
      encode(extensions.digest(decode('0102', 'hex'), 'sha256'), 'hex')
    )$$,
  $$values (1::bigint, 2::bigint, 2::bigint)$$,
  'verified compaction publishes snapshot one and prunes its covered range'
);

select is(
  (select count(*) from public.canvas_updates where canvas_id = '20000000-0000-4000-8000-000000000001'),
  0::bigint,
  'compaction prunes every and only covered update'
);

select results_eq(
  $$select version, last_sequence, pruned_updates
    from public.publish_canvas_compaction(
      '20000000-0000-4000-8000-000000000001',
      2,
      decode('0102', 'hex'),
      encode(extensions.digest(decode('0102', 'hex'), 'sha256'), 'hex')
    )$$,
  $$values (1::bigint, 2::bigint, 0::bigint)$$,
  'compaction retry is idempotent'
);

select results_eq(
  $$select sequence from public.append_canvas_update(
    '20000000-0000-4000-8000-000000000001', decode('03', 'hex'))$$,
  $$values (3::bigint)$$,
  'append sequencing continues after covered updates are pruned'
);

select throws_ok(
  $$select * from public.publish_canvas_compaction(
    '20000000-0000-4000-8000-000000000001',
    3,
    decode('010203', 'hex'),
    repeat('0', 64)
  )$$,
  '22000',
  'snapshot hash verification failed',
  'compaction rejects a state whose digest does not match'
);

reset role;

select is(
  (select count(*)::integer from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname in ('canvas_realtime_read', 'canvas_realtime_write')),
  2,
  'private Realtime Broadcast and Presence policies are installed'
);

select * from finish();
rollback;
