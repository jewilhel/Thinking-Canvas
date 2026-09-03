begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select ok(
  has_table_privilege('authenticated', 'public.comment_document_targets', 'SELECT'),
  'canvas members may read authorized document range targets'
);
select ok(
  not has_table_privilege('authenticated', 'public.comment_document_targets', 'INSERT'),
  'clients cannot bypass the document comment RPC'
);

select results_eq(
  $$select created from public.create_comment_thread(
    target_canvas_id => '20000000-0000-4000-8000-000000000001',
    target_client_command_id => '79000000-0000-4000-8000-000000000001',
    target_body => 'Clarify this phrase',
    target_prompt_kind => 'yes_no',
    target_document_object_id => '69000000-0000-4000-8000-000000000001',
    target_document_relative_anchor => 'AAECAw==',
    target_document_relative_head => 'BAUGBw==',
    target_document_quoted_text => 'selected phrase'
  )$$,
  array[true],
  'owner creates one durable document range thread'
);

select lives_ok(
  $$select * from public.create_comment_reply(
    (select id from public.comments where client_command_id = '79000000-0000-4000-8000-000000000001'),
    '79000000-0000-4000-8000-000000000011',
    'I agree with the revision.'
  )$$,
  'range comments use the ordinary durable reply path'
);

select lives_ok(
  $$select * from public.respond_to_comment_prompt(
    (select id from public.comment_prompts where comment_id = (
      select id from public.comments where client_command_id = '79000000-0000-4000-8000-000000000001'
    )),
    '79000000-0000-4000-8000-000000000012',
    '{"answer":"yes"}'::jsonb
  )$$,
  'range comments retain structured prompt responses'
);

select lives_ok(
  $$select public.transition_comment_status(
    (select id from public.comments where client_command_id = '79000000-0000-4000-8000-000000000001'),
    'resolved'
  )$$,
  'range comments use the ordinary resolve path'
);

select is(
  (select count(*)::integer from public.comment_document_targets where comment_id = (
    select id from public.comments where client_command_id = '79000000-0000-4000-8000-000000000001'
  )),
  1,
  'resolving preserves document range history'
);

select results_eq(
  $$select document_object_id, quoted_text from public.comment_document_targets
    where comment_id = (
      select id from public.comments
      where client_command_id = '79000000-0000-4000-8000-000000000001'
    )$$,
  $$values (
    '69000000-0000-4000-8000-000000000001'::uuid,
    'selected phrase'::text
  )$$,
  'relative target and bounded quote persist'
);

select throws_ok(
  $$select * from public.create_comment_thread(
    target_canvas_id => '20000000-0000-4000-8000-000000000001',
    target_client_command_id => '79000000-0000-4000-8000-000000000002',
    target_body => 'Ambiguous',
    target_object_ids => array['61000000-0000-4000-8000-000000000001']::uuid[],
    target_document_object_id => '69000000-0000-4000-8000-000000000001',
    target_document_relative_anchor => 'AAECAw==',
    target_document_relative_head => 'BAUGBw==',
    target_document_quoted_text => 'selected phrase'
  )$$,
  '22023',
  'A comment requires exactly one object target set, canvas position, or document range.',
  'document and object target families cannot be combined'
);

select throws_ok(
  $$select * from public.create_comment_thread(
    target_canvas_id => '20000000-0000-4000-8000-000000000001',
    target_client_command_id => '79000000-0000-4000-8000-000000000003',
    target_body => 'Oversized quote',
    target_document_object_id => '69000000-0000-4000-8000-000000000001',
    target_document_relative_anchor => 'AAECAw==',
    target_document_relative_head => 'BAUGBw==',
    target_document_quoted_text => repeat('x', 1001)
  )$$,
  '22023',
  'Document range target is invalid.',
  'oversized quoted text is rejected before persistence'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select * from public.create_comment_thread(
    target_canvas_id => '20000000-0000-4000-8000-000000000001',
    target_client_command_id => '79000000-0000-4000-8000-000000000004',
    target_body => 'Viewer range write',
    target_document_object_id => '69000000-0000-4000-8000-000000000001',
    target_document_relative_anchor => 'AAECAw==',
    target_document_relative_head => 'BAUGBw==',
    target_document_quoted_text => 'selected phrase'
  )$$,
  '42501',
  'Comment creation is not permitted.',
  'viewer cannot create a document range comment'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select is(
  (select count(*)::integer from public.comment_document_targets),
  0,
  'non-member cannot read document range targets'
);

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.create_comment_thread(
    target_canvas_id => '20000000-0000-4000-8000-000000000001',
    target_client_command_id => '79000000-0000-4000-8000-000000000005',
    target_body => 'Anonymous range write',
    target_document_object_id => '69000000-0000-4000-8000-000000000001',
    target_document_relative_anchor => 'AAECAw==',
    target_document_relative_head => 'BAUGBw==',
    target_document_quoted_text => 'selected phrase'
  )$$,
  '42501',
  'Authentication is required.',
  'unauthenticated principal cannot create a document range comment'
);

select * from finish();
rollback;
