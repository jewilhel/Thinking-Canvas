begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

set local role authenticated;

select ok(
  not has_table_privilege('authenticated', 'public.comments', 'INSERT'),
  'authenticated clients cannot bypass the comment command functions'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select created from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Rate this direction',
    array[
      '61000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000002'
    ]::uuid[],
    'rating',
    'human',
    null
  )$$,
  array[true],
  'owner creates one atomic human rating thread'
);

select is(
  (select author_key from public.comments where client_command_id = '71000000-0000-4000-8000-000000000001'),
  '10000000-0000-4000-8000-000000000001',
  'human provenance is normalized to the authenticated principal'
);

select is(
  (
    select count(*)::integer
    from public.comment_targets
    where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000001'
    )
  ),
  2,
  'all grouped target IDs are persisted atomically'
);

select results_eq(
  $$select minimum, maximum from public.comment_prompts where comment_id = (
    select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000001'
  )$$,
  $$values (1, 5)$$,
  'rating prompts enforce the approved fixed inclusive 1-5 range'
);

select results_eq(
  $$select created from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000006',
    'Free canvas comment',
    array[]::uuid[],
    null,
    'human',
    null,
    320.5,
    180.25
  )$$,
  array[true],
  'owner creates a comment at a finite canvas position'
);

select results_eq(
  $$select anchor_x, anchor_y from public.comments where client_command_id = '71000000-0000-4000-8000-000000000006'$$,
  $$values (320.5::double precision, 180.25::double precision)$$,
  'free canvas coordinates persist on the comment'
);

select is(
  (
    select count(*)::integer
    from public.comment_targets
    where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000006'
    )
  ),
  0,
  'free canvas comments do not create object targets'
);

select throws_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000007',
    'Ambiguous target',
    array['61000000-0000-4000-8000-000000000001']::uuid[],
    null,
    'human',
    null,
    10,
    20
  )$$,
  '22023',
  'A comment requires exactly one object target set or canvas position.',
  'object IDs and a free canvas position cannot be combined'
);

select results_eq(
  $$select created from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Rate this direction',
    array[
      '61000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000002'
    ]::uuid[],
    'rating',
    'human',
    null
  )$$,
  array[false],
  'an exact comment-command retry returns the original thread'
);

select throws_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Changed collision body',
    array['61000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  '23505',
  'The comment command ID was reused with different content.',
  'a reused comment command ID with different content is rejected'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    'AI-authored review prompt',
    array['61000000-0000-4000-8000-000000000003']::uuid[],
    'review',
    'ai',
    'primary-ai'
  )$$,
  'an editor can request a preview AI prompt'
);

select results_eq(
  $$select author_id, author_kind::text, author_key from public.comments where client_command_id = '71000000-0000-4000-8000-000000000002'$$,
  $$values (
    '10000000-0000-4000-8000-000000000002'::uuid,
    'ai'::text,
    'primary-ai'::text
  )$$,
  'AI provenance remains distinct from the accountable requester'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000003',
    'Spoofed AI prompt',
    array['61000000-0000-4000-8000-000000000004']::uuid[],
    'yes_no',
    'ai',
    'primary-ai'
  )$$,
  '42501',
  'AI comment creation is not permitted.',
  'a commenter cannot claim AI provenance'
);

select lives_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000004',
    'Commenter yes or no',
    array['61000000-0000-4000-8000-000000000004']::uuid[],
    'yes_no'
  )$$,
  'a commenter can create a human prompt'
);

select lives_ok(
  $$select * from public.create_comment_reply(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    '72000000-0000-4000-8000-000000000001',
    'First reply'
  )$$,
  'a commenter can reply to an open thread'
);

select results_eq(
  $$select created from public.create_comment_reply(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    '72000000-0000-4000-8000-000000000001',
    'First reply'
  )$$,
  array[false],
  'an exact reply retry returns the original reply'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select * from public.respond_to_comment_prompt(
    (select id from public.comment_prompts where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'
    )),
    '73000000-0000-4000-8000-000000000001',
    '{"answer":"yes"}'::jsonb
  )$$,
  'an editor can answer yes without typing'
);

select throws_ok(
  $$select * from public.respond_to_comment_prompt(
    (select id from public.comment_prompts where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'
    )),
    '73000000-0000-4000-8000-000000000002',
    '{"answer":"yes","extra":true}'::jsonb
  )$$,
  '22023',
  'Prompt response is invalid.',
  'extra response keys are rejected'
);

select lives_ok(
  $$select * from public.respond_to_comment_prompt(
    (select id from public.comment_prompts where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000001'
    )),
    '73000000-0000-4000-8000-000000000003',
    '{"rating":5}'::jsonb
  )$$,
  'the upper approved rating bound is accepted'
);

select throws_ok(
  $$select * from public.respond_to_comment_prompt(
    (select id from public.comment_prompts where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000001'
    )),
    '73000000-0000-4000-8000-000000000004',
    '{"rating":6}'::jsonb
  )$$,
  '22023',
  'Prompt response is invalid.',
  'ratings above the approved bound are rejected'
);

select lives_ok(
  $$select * from public.respond_to_comment_prompt(
    (select id from public.comment_prompts where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'
    )),
    '73000000-0000-4000-8000-000000000005',
    '{"answer":"no"}'::jsonb
  )$$,
  'an open response can be changed by the same responder'
);

select is(
  (
    select count(*)::integer
    from public.comment_responses
    where prompt_id = (
      select id from public.comment_prompts where comment_id = (
        select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'
      )
    ) and responder_id = '10000000-0000-4000-8000-000000000002'
  ),
  1,
  'response changes keep one row per prompt and responder'
);

select throws_ok(
  $$select public.set_comment_prompt(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'rating'
  )$$,
  '42501',
  'Changing this comment prompt is not permitted.',
  'an editor cannot switch another author comment prompt'
);

select throws_ok(
  $$select public.update_comment_body(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'How useful is this direction from 1 to 5?'
  )$$,
  '42501',
  'Editing this comment is not permitted.',
  'an editor cannot revise another author root question'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.set_comment_prompt(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'rating'
  )$$,
  'the comment author can switch their open thread to another supported prompt'
);

select lives_ok(
  $$select public.update_comment_body(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'How useful is this direction from 1 to 5?'
  )$$,
  'the comment author can revise the open root question to match its prompt widget'
);

select is(
  (select body from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
  'How useful is this direction from 1 to 5?',
  'the revised root question persists without replacing the thread'
);

select results_eq(
  $$select kind::text, minimum, maximum from public.comment_prompts where comment_id = (
    select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'
  )$$,
  $$values ('rating'::text, 1, 5)$$,
  'switching prompt types applies the fixed rating configuration'
);

select is(
  (
    select count(*)::integer
    from public.comment_responses
    where prompt_id = (
      select id from public.comment_prompts where comment_id = (
        select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'
      )
    )
  ),
  0,
  'switching prompt types removes responses that no longer match the widget'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.set_comment_prompt(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    null
  )$$,
  '42501',
  'Changing this comment prompt is not permitted.',
  'a viewer cannot change a comment prompt'
);

select throws_ok(
  $$select public.update_comment_body(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'Viewer rewrite'
  )$$,
  '42501',
  'Editing this comment is not permitted.',
  'a viewer cannot edit the root question'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.set_comment_prompt(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    null
  )$$,
  'selecting none removes the structured prompt'
);

select is(
  (
    select count(*)::integer
    from public.comment_prompts
    where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'
    )
  ),
  0,
  'none leaves the thread without a prompt widget'
);

select lives_ok(
  $$select public.set_comment_prompt(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'yes_no'
  )$$,
  'a supported prompt can be added again after selecting none'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.update_comment_body(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'Does this revised question work?'
  )$$,
  'a comment author can revise their own open root question'
);

select throws_ok(
  $$select public.update_comment_body(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    '   '
  )$$,
  '22023',
  'Comment body is invalid.',
  'a root-question edit cannot be blank'
);

select lives_ok(
  $$select public.transition_comment_status(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'resolved'
  )$$,
  'a commenter can resolve their own comment'
);

select throws_ok(
  $$select public.update_comment_body(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    'Edit after resolve'
  )$$,
  '22023',
  'Closed comments are read-only.',
  'resolved comments reject root-question edits'
);

select throws_ok(
  $$select * from public.create_comment_reply(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
    '72000000-0000-4000-8000-000000000002',
    'Reply after resolve'
  )$$,
  '22023',
  'Closed comments are read-only.',
  'resolved comments reject new replies'
);

select throws_ok(
  $$select public.transition_comment_status(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000002'),
    'dismissed'
  )$$,
  '42501',
  'Dismissing this comment is not permitted.',
  'a commenter cannot dismiss another author comment'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.transition_comment_status(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000002'),
    'dismissed'
  )$$,
  'an owner can dismiss any comment'
);

select is(
  (
    select count(*)::integer
    from public.comment_targets
    where comment_id = (
      select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000002'
    )
  ),
  1,
  'dismissal preserves target history'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.delete_comment_thread(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000001')
  )$$,
  '42501',
  'Deleting this comment is not permitted.',
  'an editor cannot delete another author comment'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.delete_comment_thread(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004')
  )$$,
  'an author can permanently delete their own closed thread'
);

select is(
  (select count(*)::integer from public.comments where client_command_id = '71000000-0000-4000-8000-000000000004'),
  0,
  'deletion removes the root comment'
);

select is(
  (select count(*)::integer from public.comment_replies where client_command_id = '72000000-0000-4000-8000-000000000001'),
  0,
  'deletion cascades to replies'
);

select is(
  (select count(*)::integer from public.comment_targets where target_object_id = '61000000-0000-4000-8000-000000000004'),
  0,
  'deletion cascades to targets'
);

select is(
  (select count(*)::integer from public.comment_responses where client_command_id in (
    '73000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000005'
  )),
  0,
  'deletion cascades through the prompt to responses'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.delete_comment_thread(
    (select id from public.comments where client_command_id = '71000000-0000-4000-8000-000000000002')
  )$$,
  'a canvas owner can delete another author thread'
);

select is(
  (select count(*)::integer from public.comments where client_command_id = '71000000-0000-4000-8000-000000000002'),
  0,
  'owner deletion removes the selected thread'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select * from public.create_comment_thread(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000005',
    'Viewer write',
    array['61000000-0000-4000-8000-000000000005']::uuid[]
  )$$,
  '42501',
  'Comment creation is not permitted.',
  'viewers remain read-only'
);

select * from finish();
rollback;
