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

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select * from public.capture_primary_story_scene(
    '20000000-0000-4000-8000-000000000001',
    'Viewer scene',
    '{"version":1,"center":{"x":0,"y":0},"zoom":1}',
    '{"version":1,"kind":"viewport","bounds":{"x":0,"y":0,"width":800,"height":600}}',
    2
  )$$,
  '42501',
  'Story editing requires owner or editor access.',
  'a viewer cannot capture a story scene'
);

reset role;
select * from finish();
rollback;
