begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

delete from public.stories
where canvas_id = '20000000-0000-4000-8000-000000000001'
  and kind = 'general';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select story_revision, scene_title, scene_position
    from public.capture_primary_story_scene(
      '20000000-0000-4000-8000-000000000001',
      'Opening view',
      '{"version":1,"center":{"x":100,"y":80},"zoom":1.25}',
      '{"version":1,"kind":"viewport","bounds":{"x":0,"y":0,"width":800,"height":600}}',
      null
    )$$,
  $$values (1::bigint, 'Opening view'::text, 0::integer)$$,
  'an owner atomically creates the primary story and first scene'
);

select results_eq(
  $$select story_revision, scene_title, scene_position
    from public.capture_primary_story_scene(
      '20000000-0000-4000-8000-000000000001',
      'Detail',
      '{"version":1,"center":{"x":420,"y":300},"zoom":2}',
      '{"version":1,"kind":"viewport","bounds":{"x":220,"y":150,"width":400,"height":300}}',
      1
    )$$,
  $$values (2::bigint, 'Detail'::text, 1::integer)$$,
  'a matching story revision appends the next contiguous scene'
);

select is(
  (
    select count(*)
    from public.stories
    where canvas_id = '20000000-0000-4000-8000-000000000001'
      and kind = 'general'
  ),
  1::bigint,
  'a canvas has only one primary general story'
);

select throws_ok(
  $$select * from public.capture_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    'Stale scene',
    '{"version":1,"center":{"x":0,"y":0},"zoom":1}',
    '{"version":1,"kind":"viewport","bounds":{"x":0,"y":0,"width":800,"height":600}}',
    0
  )$$,
  '40001',
  'The story changed in another session.',
  'a stale revision cannot append a scene'
);

select is(
  public.update_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Opening view'),
    2,
    'Introduction',
    null,
    null
  ),
  3::bigint,
  'rename advances the story revision'
);

select results_eq(
  $$select title, position, camera
    from public.story_scenes
    where title = 'Introduction'$$,
  $$values (
    'Introduction'::text,
    0::integer,
    '{"version":1,"center":{"x":100,"y":80},"zoom":1.25}'::jsonb
  )$$,
  'rename preserves camera and order'
);

select is(
  public.update_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Introduction'),
    3,
    null,
    '{"version":1,"center":{"x":700,"y":500},"zoom":3}'::jsonb,
    '{"version":1,"kind":"viewport","bounds":{"x":566.6666667,"y":400,"width":266.6666667,"height":200}}'::jsonb
  ),
  4::bigint,
  'replace advances the story revision'
);

select results_eq(
  $$select title, position, camera->>'zoom'
    from public.story_scenes
    where title = 'Introduction'$$,
  $$values ('Introduction'::text, 0::integer, '3'::text)$$,
  'replace preserves title and order while changing framing'
);

select is(
  public.reorder_primary_story_scenes(
    '20000000-0000-4000-8000-000000000001',
    array[
      (select scene.id from public.story_scenes scene where scene.title = 'Detail'),
      (select scene.id from public.story_scenes scene where scene.title = 'Introduction')
    ],
    4
  ),
  5::bigint,
  'reorder advances the story revision'
);

select results_eq(
  $$select title, position from public.story_scenes
    where deleted_at is null order by position$$,
  $$values ('Detail'::text, 0::integer), ('Introduction'::text, 1::integer)$$,
  'reorder persists an exact contiguous order'
);

select throws_ok(
  $$select public.reorder_primary_story_scenes(
    '20000000-0000-4000-8000-000000000001',
    array[(select scene.id from public.story_scenes scene where scene.title = 'Detail')],
    5
  )$$,
  '22023',
  'The ordered scene list must contain every active scene exactly once.',
  'reorder rejects an incomplete scene list'
);

select is(
  public.delete_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Detail'),
    5
  ),
  6::bigint,
  'delete advances the story revision'
);

select results_eq(
  $$select title, position from public.story_scenes
    where deleted_at is null order by position$$,
  $$values ('Introduction'::text, 0::integer)$$,
  'delete keeps active positions contiguous'
);

select is(
  (select deleted_at is not null from public.story_scenes where title = 'Detail'),
  true,
  'delete preserves a soft-deleted row for future scene history'
);

select is(
  public.restore_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Detail'),
    6
  ),
  7::bigint,
  'undo restores a soft-deleted scene'
);

select results_eq(
  $$select title, position from public.story_scenes
    where deleted_at is null order by position$$,
  $$values ('Detail'::text, 0::integer), ('Introduction'::text, 1::integer)$$,
  'undo restores the original order with contiguous positions'
);

select throws_ok(
  $$select public.delete_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    (select scene.id from public.story_scenes scene where scene.title = 'Detail'),
    6
  )$$,
  '40001',
  'The story changed in another session.',
  'a stale session cannot overwrite newer scene management'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select * from public.capture_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    'Viewer scene',
    '{"version":1,"center":{"x":0,"y":0},"zoom":1}',
    '{"version":1,"kind":"viewport","bounds":{"x":0,"y":0,"width":800,"height":600}}',
    7
  )$$,
  '42501',
  'Story editing requires owner or editor access.',
  'a viewer cannot capture a story scene'
);

reset role;
select * from finish();
rollback;
