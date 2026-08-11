do $$
declare
  user_ids uuid[] := array[
    '10000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid,
    '10000000-0000-4000-8000-000000000004'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid
  ];
  emails text[] := array[
    'owner@thinking-canvas.local',
    'editor@thinking-canvas.local',
    'commenter@thinking-canvas.local',
    'viewer@thinking-canvas.local',
    'nonmember@thinking-canvas.local'
  ];
  display_names text[] := array[
    'Owner Example',
    'Editor Example',
    'Commenter Example',
    'Viewer Example',
    'Non-member Example'
  ];
  confirmation_column text;
  index integer;
begin
  confirmation_column := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at'
    ) then 'email_confirmed_at'
    else 'confirmed_at'
  end;

  for index in 1..array_length(user_ids, 1) loop
    execute format(
      'insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, %I,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, recovery_token
      ) values (
        %L, %L, %L, %L, %L, extensions.crypt(%L, extensions.gen_salt(''bf'')), now(),
        %L::jsonb, %L::jsonb, now(), now(), %L, %L, %L
      ) on conflict (id) do nothing',
      confirmation_column,
      '00000000-0000-0000-0000-000000000000',
      user_ids[index],
      'authenticated',
      'authenticated',
      emails[index],
      'LocalPassword1!',
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('display_name', display_names[index]),
      '', '', ''
    );
  end loop;

  if to_regclass('auth.identities') is not null then
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    select
      id,
      id::text,
      id,
      jsonb_build_object('sub', id::text, 'email', email),
      'email',
      now(),
      now(),
      now()
    from auth.users
    where email like '%@thinking-canvas.local'
    on conflict (provider_id, provider) do nothing;
  end if;
end;
$$;

insert into public.canvases (id, owner_id, title)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic architecture spike canvas'
)
on conflict (id) do nothing;

insert into public.canvas_members (canvas_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'editor'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'commenter'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'viewer')
on conflict (canvas_id, user_id) do update set role = excluded.role;

insert into public.comments (id, canvas_id, author_id, body)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'Synthetic comment for local RLS verification.'
)
on conflict (id) do nothing;

insert into public.comment_prompts (id, comment_id, kind)
values (
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'yes_no'
)
on conflict (id) do nothing;

insert into public.starter_templates (id, owner_id, name, snapshot)
values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic empty structure',
  '{"schemaVersion":1,"objects":[]}'
)
on conflict (id) do nothing;
