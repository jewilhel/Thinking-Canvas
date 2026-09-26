begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into public.canvases(id,owner_id,title) values ('88888888-8888-4888-8888-888888888888','10000000-0000-4000-8000-000000000001','Voice comment guard QA');
select is((select enabled from public.canvas_ai_settings where canvas_id='88888888-8888-4888-8888-888888888888'),true,'new canvas enables AI');
select is((select authority::text from public.canvas_ai_settings where canvas_id='88888888-8888-4888-8888-888888888888'),'trusted_editor','new canvas defaults to Trusted Editor');
set local role service_role;
select public.reserve_live_voice_test('99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888','10000000-0000-4000-8000-000000000001');
update public.voice_test_sessions set supervisor_ready=true,heartbeat_at=now() where id='99999999-9999-4999-8999-999999999999';
select public.reserve_voice_delegation('99999999-9999-4999-8999-999999999999','comment-qa');
select set_config('test.voice_task_id',(select id::text from public.voice_delegations where delegation_id='comment-qa'),true);
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.create_comment_thread(target_canvas_id=>'88888888-8888-4888-8888-888888888888',target_client_command_id=>current_setting('test.voice_task_id')::uuid,target_body=>'Leave a comment on the shape.',target_anchor_x=>0,target_anchor_y=>0,target_object_ids=>array[]::uuid[],target_ordered_context_ids=>array[]::uuid[],target_include_primary_ai=>true);
reset role;
update public.voice_delegations d set ai_run_id=r.id from public.ai_runs r where r.idempotency_key=d.id and d.delegation_id='comment-qa';
update public.ai_runs set status='thinking' where idempotency_key=(select id from public.voice_delegations where delegation_id='comment-qa');
update public.canvas_ai_settings set authority='edit_with_review' where canvas_id='88888888-8888-4888-8888-888888888888';
set local role service_role;
select lives_ok($q$select public.stage_ai_canvas_changes(
(select ai_run_id from public.voice_delegations where delegation_id='comment-qa'),
'10000000-0000-4000-8000-000000000001','voice-stage','Move the object.',
'[{
"objectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
"beforeState":{"object":{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","canvasId":"88888888-8888-4888-8888-888888888888","geometry":{"x":0,"y":0}},"orderIndex":0},
"afterState":{"object":{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","canvasId":"88888888-8888-4888-8888-888888888888","geometry":{"x":40,"y":0}},"orderIndex":0},
"affectedFields":["object.geometry.x"]
}]'::jsonb,0)$q$,'voice Edit with undo stages through existing workflow');
reset role;
select set_config('test.voice_change_set',(select id::text from public.ai_change_sets where ai_run_id=(select ai_run_id from public.voice_delegations where delegation_id='comment-qa')),true);
set local role service_role;
select lives_ok($q$select public.finalize_ai_review_stage(current_setting('test.voice_change_set')::uuid,'10000000-0000-4000-8000-000000000001','Move the object.','[{"objectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","whatChanged":"Moved right","why":"Requested"}]'::jsonb,'world_space',array[]::uuid[],'{}'::jsonb)$q$,'voice stage finalizes existing review contract');
update public.voice_test_sessions set backend_cancel_at=clock_timestamp() where id='99999999-9999-4999-8999-999999999999';
select throws_ok($q$select public.activate_ai_review_stage(current_setting('test.voice_change_set')::uuid,'10000000-0000-4000-8000-000000000001',decode('0102','hex'),0)$q$,'42501',null,'cancellation between staging and activation blocks publication');
reset role;
select is((select count(*) from public.canvas_updates where canvas_id='88888888-8888-4888-8888-888888888888'),0::bigint,'cancelled activation rolls back provisional update');
select is((select activation_sequence from public.ai_change_sets where id=current_setting('test.voice_change_set')::uuid),null::bigint,'cancelled change set remains unactivated');
update public.voice_test_sessions set backend_cancel_at=null,close_requested_at=clock_timestamp() where id='99999999-9999-4999-8999-999999999999';
set local role service_role;
select throws_ok($q$select public.activate_ai_review_stage(current_setting('test.voice_change_set')::uuid,'10000000-0000-4000-8000-000000000001',decode('0102','hex'),0)$q$,'42501',null,'closed voice session cannot activate staged edit');
reset role;
update public.voice_test_sessions set close_requested_at=null where id='99999999-9999-4999-8999-999999999999';
update public.canvas_ai_settings set authority='comment_only' where canvas_id='88888888-8888-4888-8888-888888888888';
set local role service_role;
select throws_ok($q$select public.activate_ai_review_stage(current_setting('test.voice_change_set')::uuid,'10000000-0000-4000-8000-000000000001',decode('0102','hex'),0)$q$,'42501',null,'authority downgrade blocks staged activation');
reset role;
update public.canvas_ai_settings set authority='edit_with_review' where canvas_id='88888888-8888-4888-8888-888888888888';
set local role service_role;
select lives_ok($q$select public.activate_ai_review_stage(current_setting('test.voice_change_set')::uuid,'10000000-0000-4000-8000-000000000001',decode('0102','hex'),0)$q$,'active authorized voice stage publishes');
select lives_ok($q$select public.activate_ai_review_stage(current_setting('test.voice_change_set')::uuid,'10000000-0000-4000-8000-000000000001',decode('0102','hex'),0)$q$,'activation replay remains idempotent');
reset role;
select is((select count(*) from public.canvas_updates where canvas_id='88888888-8888-4888-8888-888888888888'),1::bigint,'one durable update after replay');

select set_config('test.action_run',(select ai_run_id::text from public.voice_delegations where delegation_id='comment-qa'),true);
set local role authenticated;
select lives_ok($q$select public.manage_voice_comment(
 current_setting('test.action_run')::uuid, 'create-comment', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'create', null, 'Voice comment fixture'
)$q$, 'active voice creates a canvas comment');
reset role;
select set_config('test.new_comment',(select id::text from public.comments where body='Voice comment fixture'),true);
set local role authenticated;
select lives_ok($q$select public.manage_voice_comment(
 current_setting('test.action_run')::uuid, 'reply-comment', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'reply', current_setting('test.new_comment')::uuid, 'Voice reply fixture'
)$q$, 'voice replies to selected comment');
select lives_ok($q$select public.manage_voice_comment(
 current_setting('test.action_run')::uuid, 'reply-comment', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'reply', current_setting('test.new_comment')::uuid, 'Voice reply fixture'
)$q$, 'reply replay succeeds');
reset role;
select is((select count(*) from public.comment_replies where body='Voice reply fixture'),1::bigint,'reply replay creates no duplicate');
set local role authenticated;
select lives_ok($q$select public.manage_voice_comment(
 current_setting('test.action_run')::uuid, 'resolve-comment', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'resolve', current_setting('test.new_comment')::uuid, ''
)$q$, 'voice resolves comment');
select lives_ok($q$select public.manage_voice_comment(
 current_setting('test.action_run')::uuid, 'reopen-comment', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'reopen', current_setting('test.new_comment')::uuid, ''
)$q$, 'voice reopens comment');
reset role;
update public.voice_test_sessions set backend_cancel_at=clock_timestamp() where id='99999999-9999-4999-8999-999999999999';
set local role authenticated;
select throws_ok($q$select public.manage_voice_comment(
 current_setting('test.action_run')::uuid, 'delete-comment', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'delete', current_setting('test.new_comment')::uuid, ''
)$q$,'42501',null,'cancelled voice cannot delete');
reset role;
set local role service_role;
select throws_ok($q$select public.undo_voice_ai_change_set(
 current_setting('test.action_run')::uuid, current_setting('test.voice_change_set')::uuid,
 '10000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',decode('0103','hex'),1,'[]'
)$q$,'42501',null,'cancelled voice cannot undo');
reset role;
update public.voice_test_sessions set backend_cancel_at=null where id='99999999-9999-4999-8999-999999999999';
set local role service_role;
select lives_ok($q$select public.undo_voice_ai_change_set(
 current_setting('test.action_run')::uuid, current_setting('test.voice_change_set')::uuid,
 '10000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',decode('0103','hex'),1,'[]'
)$q$,'active voice undoes its applied change');
reset role;
set local role authenticated;
select lives_ok($q$select public.manage_voice_comment(
 current_setting('test.action_run')::uuid, 'delete-comment', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'delete', current_setting('test.new_comment')::uuid, ''
)$q$, 'voice deletes comment');
reset role;
select is((select count(*) from public.comments where id=current_setting('test.new_comment')::uuid),0::bigint,'deleted thread is absent');
select * from finish();
rollback;
