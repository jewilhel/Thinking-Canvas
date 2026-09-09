begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into public.canvas_ai_settings(canvas_id,enabled,authority,changed_by)
values('20000000-0000-4000-8000-000000000001',true,'comment_only','10000000-0000-4000-8000-000000000001')
on conflict(canvas_id) do update set enabled=true;
set local role authenticated;
select throws_ok($$select * from public.voice_test_sessions$$,'42501',null,'clients cannot read operational sessions');
select throws_ok($$select public.reserve_voice_test(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')$$,'42501',null,'clients cannot impersonate a test user');
reset role;
set local role service_role;
select throws_ok($$select public.reserve_voice_test(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004')$$,'42501',null,'viewers cannot voice');
select lives_ok($$select public.reserve_voice_test('33333333-3333-4333-8333-333333333333','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')$$,'owner reserves allowance');
select ok((select expires_at-started_at <= interval '10 minutes' from public.voice_test_sessions where id='33333333-3333-4333-8333-333333333333'),'server expiry is bounded');
select throws_ok($$select public.reserve_voice_test(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')$$,'P0001',null,'parallel sessions cannot oversubscribe');
select lives_ok($$select public.finish_voice_test('33333333-3333-4333-8333-333333333333',55,'test')$$,'settles confirmed usage');
select lives_ok($$select public.finish_voice_test('33333333-3333-4333-8333-333333333333',55,'retry')$$,'settlement is idempotent');
select is((select spent_cents from public.voice_test_days where day=(now() at time zone 'America/Los_Angeles')::date),55,'does not double charge');
select is((select reserved_cents from public.voice_test_days where day=(now() at time zone 'America/Los_Angeles')::date),0,'releases confirmed unused allowance');
reset role;
select * from finish();
rollback;
