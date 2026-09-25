begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Browser tests may have saved settings for these seeded accounts. Keep this
-- fixture isolated within the transaction; the rollback restores their rows.
delete from public.voice_user_settings
where user_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok($$insert into public.voice_user_settings values(auth.uid(),'{"greeting":"Welcome","goodbye":"Bye"}')$$,'save own settings');
select is((select settings->>'greeting' from public.voice_user_settings),'Welcome','read own greeting');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.voice_user_settings),0::bigint,'other account cannot read');
select throws_ok($$insert into public.voice_user_settings values('10000000-0000-4000-8000-000000000001','{}') on conflict(user_id) do update set settings='{}'$$,'42501',null,'other account cannot overwrite');
reset role;
select * from finish();
rollback;
