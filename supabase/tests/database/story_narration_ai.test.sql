begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

delete from public.stories
where canvas_id = '20000000-0000-4000-8000-000000000001'
  and kind = 'general';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select * from public.capture_primary_story_scene(
  '20000000-0000-4000-8000-000000000001',
  'Narrated scene',
  '{"version":1,"center":{"x":100,"y":80},"zoom":1.25}',
  '{"version":1,"kind":"viewport","bounds":{"x":0,"y":0,"width":800,"height":600}}',
  null
);

select is(
  public.update_primary_story_scene_narration(
    '20000000-0000-4000-8000-000000000001',
    (select id from public.story_scenes where title = 'Narrated scene'
      and story_id = (select id from public.stories where canvas_id = '20000000-0000-4000-8000-000000000001' and kind = 'general')),
    1,
    'Begin with the complete canvas.'
  ),
  2::bigint,
  'an owner persists one narration script and advances the story revision'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is(
  public.update_primary_story_scene_narration(
    '20000000-0000-4000-8000-000000000001',
    (select id from public.story_scenes where title = 'Narrated scene'
      and story_id = (select id from public.stories where canvas_id = '20000000-0000-4000-8000-000000000001' and kind = 'general')),
    2,
    'Pause on the main relationship.'
  ),
  3::bigint,
  'an editor can revise the persisted script'
);

select throws_ok(
  $$select public.update_primary_story_scene_narration(
    '20000000-0000-4000-8000-000000000001',
    (select id from public.story_scenes where title = 'Narrated scene'
      and story_id = (select id from public.stories where canvas_id = '20000000-0000-4000-8000-000000000001' and kind = 'general')),
    2,
    'Stale replacement'
  )$$,
  '40001',
  'The story changed in another session.',
  'a stale narration revision fails closed'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.update_primary_story_scene_narration(
    '20000000-0000-4000-8000-000000000001',
    (select id from public.story_scenes where title = 'Narrated scene'
      and story_id = (select id from public.stories where canvas_id = '20000000-0000-4000-8000-000000000001' and kind = 'general')),
    3,
    'Viewer replacement'
  )$$,
  '42501',
  'Story editing requires owner or editor access.',
  'a viewer cannot edit narration'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select * from public.set_canvas_ai_settings(
  '20000000-0000-4000-8000-000000000001', true, 'trusted_editor', 0
);

select * from public.create_scene_comment_thread(
  target_canvas_id => '20000000-0000-4000-8000-000000000001',
  target_scene_id => (select id from public.story_scenes where title = 'Narrated scene'
    and story_id = (select id from public.stories where canvas_id = '20000000-0000-4000-8000-000000000001' and kind = 'general')),
  target_client_command_id => '72000000-0000-4000-8000-000000000001',
  target_body => 'Revise the narration, then add a closing scene.',
  target_include_primary_ai => true
);

select * from public.start_ai_run(
  (select id from public.ai_runs
   where idempotency_key = '72000000-0000-4000-8000-000000000001')
);

select set_config(
  'test.story_run_id',
  (select id::text from public.ai_runs
   where idempotency_key = '72000000-0000-4000-8000-000000000001'),
  true
);
select set_config(
  'test.story_scene_id',
  (select id::text from public.story_scenes where title = 'Narrated scene'
    and story_id = (select id from public.stories where canvas_id = '20000000-0000-4000-8000-000000000001' and kind = 'general')),
  true
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select scene_id, created from public.execute_ai_story_scene(
    current_setting('test.story_run_id')::uuid,
    '10000000-0000-4000-8000-000000000001',
    'story-update-1',
    'update_current',
    current_setting('test.story_scene_id')::uuid,
    null,
    'Explain the relationship before moving on.',
    null,
    null,
    array[]::uuid[]
  )$$,
  $$values (current_setting('test.story_scene_id')::uuid, true)$$,
  'trusted primary AI updates only the invoking scene'
);

select results_eq(
  $$select scene_id, created from public.execute_ai_story_scene(
    current_setting('test.story_run_id')::uuid,
    '10000000-0000-4000-8000-000000000001',
    'story-update-1',
    'update_current',
    current_setting('test.story_scene_id')::uuid,
    null,
    'Explain the relationship before moving on.',
    null,
    null,
    array[]::uuid[]
  )$$,
  $$values (current_setting('test.story_scene_id')::uuid, false)$$,
  'an exact AI story retry is acknowledged without a duplicate mutation'
);

select throws_ok(
  $$select * from public.execute_ai_story_scene(
    current_setting('test.story_run_id')::uuid,
    '10000000-0000-4000-8000-000000000001',
    'story-update-1',
    'update_current',
    current_setting('test.story_scene_id')::uuid,
    null,
    'Changed retry content',
    null,
    null,
    array[]::uuid[]
  )$$,
  '23505',
  'The tool call identity was reused with different or incomplete work.',
  'a changed-content call-key retry fails closed'
);

select throws_ok(
  $$select * from public.execute_ai_story_scene(
    current_setting('test.story_run_id')::uuid,
    '10000000-0000-4000-8000-000000000001',
    'story-forged-1',
    'update_current',
    '72000000-0000-4000-8000-000000000099',
    'Forged',
    null,
    null,
    null,
    array[]::uuid[]
  )$$,
  '42501',
  'The AI scene target is not the invoking scene.',
  'a forged scene identity fails closed'
);

select results_eq(
  $$select created from public.execute_ai_story_scene(
    current_setting('test.story_run_id')::uuid,
    '10000000-0000-4000-8000-000000000001',
    'story-create-1',
    'create',
    null,
    'Closing scene',
    'End on the outcome.',
    '{"version":1,"center":{"x":420,"y":300},"zoom":2}',
    '{"version":1,"kind":"viewport","bounds":{"x":220,"y":150,"width":400,"height":300}}',
    array['61000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  array[true],
  'trusted primary AI appends one ordered grounded scene'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select title, position, narration from public.story_scenes
    where deleted_at is null
      and story_id = (select id from public.stories where canvas_id = '20000000-0000-4000-8000-000000000001' and kind = 'general')
    order by position$$,
  $$values
    ('Narrated scene'::text, 0::integer, 'Explain the relationship before moving on.'::text),
    ('Closing scene'::text, 1::integer, 'End on the outcome.'::text)$$,
  'AI story mutations preserve contiguous order and persisted captions'
);

select * from public.set_canvas_ai_settings(
  '20000000-0000-4000-8000-000000000001', true, 'propose_changes', 1
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select * from public.execute_ai_story_scene(
    current_setting('test.story_run_id')::uuid,
    '10000000-0000-4000-8000-000000000001',
    'story-after-downgrade',
    'update_current',
    current_setting('test.story_scene_id')::uuid,
    null,
    'This must not persist.',
    null,
    null,
    array[]::uuid[]
  )$$,
  '42501',
  'Trusted AI story editing is not permitted.',
  'downgraded AI authority cannot mutate the story'
);

reset role;
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public'
     and table_name = 'story_scenes'
     and column_name like '%audio%'),
  0,
  'the durable story schema stores no generated audio'
);

select * from finish();
rollback;
