begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select is(
  (
    select count(*)::integer
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = any(array[
        'profiles', 'canvases', 'canvas_members', 'canvas_invitations',
        'canvas_updates', 'canvas_snapshots', 'comments', 'comment_targets',
        'comment_replies', 'comment_prompts', 'comment_responses',
        'ai_change_sets', 'ai_object_changes', 'review_decisions', 'stories',
        'story_scenes', 'starter_templates'
      ])
      and pg_class.relrowsecurity
  ),
  17,
  'RLS is enabled on every user-owned table'
);

insert into public.canvas_invitations (
  id, canvas_id, email, role, invited_by, expires_at
)
values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'invitee@thinking-canvas.local',
  'viewer',
  '10000000-0000-4000-8000-000000000001',
  now() + interval '7 days'
);

insert into public.canvas_updates (canvas_id, sequence, update_data, actor_id)
values (
  '20000000-0000-4000-8000-000000000001',
  1,
  decode('01', 'hex'),
  '10000000-0000-4000-8000-000000000001'
);

insert into public.canvas_snapshots (
  id, canvas_id, version, last_sequence, state, state_hash, created_by
)
values (
  '50000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  1,
  1,
  decode('01', 'hex'),
  repeat('a', 64),
  '10000000-0000-4000-8000-000000000001'
);

insert into public.comment_targets (id, comment_id, target_object_id, target_order)
values (
  '50000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  0
);

insert into public.comment_replies (id, comment_id, author_id, body)
values (
  '50000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'Synthetic reply.'
);

insert into public.comment_responses (id, prompt_id, responder_id, value)
values (
  '50000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  '{"answer":true}'
);

insert into public.ai_change_sets (id, canvas_id, requested_by, status)
values (
  '50000000-0000-4000-8000-000000000006',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'applied'
);

insert into public.ai_object_changes (
  id, change_set_id, object_id, before_state, after_state, affected_fields
)
values (
  '50000000-0000-4000-8000-000000000007',
  '50000000-0000-4000-8000-000000000006',
  '60000000-0000-4000-8000-000000000001',
  '{"text":"Before"}',
  '{"text":"After"}',
  array['text']
);

insert into public.review_decisions (
  id, object_change_id, reviewer_id, decision
)
values (
  '50000000-0000-4000-8000-000000000008',
  '50000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000003',
  'keep'
);

insert into public.stories (id, canvas_id, author_id, title)
values (
  '50000000-0000-4000-8000-000000000009',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic story'
);

insert into public.story_scenes (id, story_id, position, target, camera)
values (
  '50000000-0000-4000-8000-000000000010',
  '50000000-0000-4000-8000-000000000009',
  0,
  '{"objectIds":[]}',
  '{"x":0,"y":0,"zoom":1}'
);

create temporary table policy_matrix (
  table_name text primary key,
  owner_visible boolean not null,
  editor_visible boolean not null,
  commenter_visible boolean not null,
  viewer_visible boolean not null,
  nonmember_visible boolean not null
) on commit drop;

insert into policy_matrix values
  ('profiles', true, true, true, true, true),
  ('canvases', true, true, true, true, false),
  ('canvas_members', true, true, true, true, false),
  ('canvas_invitations', true, false, false, false, false),
  ('canvas_updates', true, true, true, true, false),
  ('canvas_snapshots', true, true, true, true, false),
  ('comments', true, true, true, true, false),
  ('comment_targets', true, true, true, true, false),
  ('comment_replies', true, true, true, true, false),
  ('comment_prompts', true, true, true, true, false),
  ('comment_responses', true, true, true, true, false),
  ('ai_change_sets', true, true, true, true, false),
  ('ai_object_changes', true, true, true, true, false),
  ('review_decisions', true, true, true, true, false),
  ('stories', true, true, true, true, false),
  ('story_scenes', true, true, true, true, false),
  ('starter_templates', true, false, false, false, false);

create function pg_temp.visible_rows(target_table text, actor_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_count bigint;
begin
  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor_id, 'role', 'authenticated')::text,
    true
  );
  execute format('select count(*) from public.%I', target_table) into row_count;
  return row_count;
end;
$$;

grant select on policy_matrix to authenticated;
grant execute on function pg_temp.visible_rows(text, uuid) to authenticated;

set local role authenticated;

select is(
  pg_temp.visible_rows(table_name, '10000000-0000-4000-8000-000000000001') > 0,
  owner_visible,
  format('owner select visibility: %s', table_name)
)
from policy_matrix;

select is(
  pg_temp.visible_rows(table_name, '10000000-0000-4000-8000-000000000002') > 0,
  editor_visible,
  format('editor select visibility: %s', table_name)
)
from policy_matrix;

select is(
  pg_temp.visible_rows(table_name, '10000000-0000-4000-8000-000000000003') > 0,
  commenter_visible,
  format('commenter select visibility: %s', table_name)
)
from policy_matrix;

select is(
  pg_temp.visible_rows(table_name, '10000000-0000-4000-8000-000000000004') > 0,
  viewer_visible,
  format('viewer select visibility: %s', table_name)
)
from policy_matrix;

select is(
  pg_temp.visible_rows(table_name, '10000000-0000-4000-8000-000000000005') > 0,
  nonmember_visible,
  format('non-member select visibility: %s', table_name)
)
from policy_matrix;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select * from public.append_canvas_update(
    '20000000-0000-4000-8000-000000000001', decode('02', 'hex'))$$,
  'editor may append a canvas update'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.append_canvas_update(
    '20000000-0000-4000-8000-000000000001', decode('03', 'hex'))$$,
  '42501',
  'canvas update is not permitted',
  'commenter may not append a canvas update'
);

select lives_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    'Allowed commenter mutation',
    array['60000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'commenter may create a comment'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002',
    'Denied viewer mutation',
    array['60000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  '42501',
  'Comment creation is not permitted.',
  'viewer may not create a comment'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into public.canvas_invitations (canvas_id, email, role, invited_by, expires_at)
    values ('20000000-0000-4000-8000-000000000001', 'owner-invite@thinking-canvas.local', 'viewer', '10000000-0000-4000-8000-000000000001', now() + interval '1 day')$$,
  'owner may create an invitation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$insert into public.canvas_invitations (canvas_id, email, role, invited_by, expires_at)
    values ('20000000-0000-4000-8000-000000000001', 'editor-invite@thinking-canvas.local', 'viewer', '10000000-0000-4000-8000-000000000002', now() + interval '1 day')$$,
  '42501',
  'new row violates row-level security policy for table "canvas_invitations"',
  'editor may not create an invitation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003',
    'Denied non-member mutation',
    array['60000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  '42501',
  'Comment creation is not permitted.',
  'non-member may not mutate a canvas'
);

reset role;
delete from public.canvas_members
where canvas_id = '20000000-0000-4000-8000-000000000001'
  and user_id = '10000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.create_comment_reply(
    '30000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000004',
    'Denied former-member reply'
  )$$,
  '42501',
  'Reply creation is not permitted.',
  'former commenter immediately loses mutation rights'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.canvases$$,
  '42501',
  'permission denied for table canvases',
  'unauthenticated database role cannot read canvases'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$delete from public.canvases where id = '20000000-0000-4000-8000-000000000001'$$,
  'owner may delete a canvas and cascade its protected owner membership'
);

reset role;
select * from finish();
rollback;
