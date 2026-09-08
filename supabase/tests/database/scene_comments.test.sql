begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

delete from public.stories
where canvas_id = '20000000-0000-4000-8000-000000000001'
  and kind = 'general';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select * from public.capture_primary_story_scene(
  '20000000-0000-4000-8000-000000000001',
  'Scene context',
  '{"version":1,"center":{"x":100,"y":80},"zoom":1.25}',
  '{"version":1,"kind":"viewport","bounds":{"x":0,"y":0,"width":800,"height":600}}',
  null
);

select results_eq(
  $$select created from public.create_scene_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Scene context'),
    '71000000-0000-4000-8000-000000000020',
    'Explain this view'
  )$$,
  array[true],
  'an owner creates a threaded scene comment'
);

select results_eq(
  $$select scene.title, scene.deleted_at is not null
    from public.comment_scene_targets target
    join public.story_scenes scene on scene.id = target.scene_id
    join public.comments comment on comment.id = target.comment_id
    where comment.client_command_id = '71000000-0000-4000-8000-000000000020'$$,
  $$values ('Scene context'::text, false)$$,
  'the scene association is durable and readable'
);

select results_eq(
  $$select created from public.create_scene_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Scene context'),
    '71000000-0000-4000-8000-000000000020',
    'Explain this view'
  )$$,
  array[false],
  'an exact scene-comment retry is idempotent'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select * from public.create_scene_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Scene context'),
    '71000000-0000-4000-8000-000000000023',
    'Editor context'
  )$$,
  'an editor can create scene context'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select * from public.create_scene_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Scene context'),
    '71000000-0000-4000-8000-000000000024',
    'Commenter context'
  )$$,
  'a commenter can create scene context without story-edit permission'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select is(
  public.delete_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Scene context'),
    1
  ),
  2::bigint,
  'the scene can be soft deleted'
);

select results_eq(
  $$select scene.title, scene.deleted_at is not null
    from public.comment_scene_targets target
    join public.story_scenes scene on scene.id = target.scene_id
    join public.comments comment on comment.id = target.comment_id
    where comment.client_command_id = '71000000-0000-4000-8000-000000000020'$$,
  $$values ('Scene context'::text, true)$$,
  'soft deletion preserves clearly identifiable scene comment history'
);

select throws_ok(
  $$select * from public.create_scene_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Scene context'),
    '71000000-0000-4000-8000-000000000021',
    'Late context'
  )$$,
  '22023',
  'The active scene is not available on this canvas.',
  'new context cannot target a deleted scene'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is(
  (
    select count(*)
    from public.comment_scene_targets target
    join public.comments comment on comment.id = target.comment_id
    where comment.canvas_id = '20000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'a commenter can read scene associations'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select * from public.create_scene_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Scene context'),
    '71000000-0000-4000-8000-000000000022',
    'Viewer context'
  )$$,
  '42501',
  'Comment creation is not permitted.',
  'a viewer cannot create scene context'
);

reset role;
select * from finish();
rollback;
