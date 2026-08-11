create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.canvas_role as enum ('owner', 'editor', 'commenter', 'viewer');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.comment_status as enum ('open', 'resolved', 'dismissed');
create type public.comment_prompt_kind as enum ('yes_no', 'review', 'rating');
create type public.ai_change_status as enum ('pending', 'applied', 'partially_reviewed', 'complete', 'failed');
create type public.review_decision_kind as enum ('keep', 'revise', 'discard');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.canvases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.canvas_members (
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.canvas_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (canvas_id, user_id)
);

create unique index canvas_members_one_owner_idx
  on public.canvas_members (canvas_id)
  where role = 'owner';
create index canvas_members_user_canvas_idx
  on public.canvas_members (user_id, canvas_id, role);

create table public.canvas_invitations (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 320),
  role public.canvas_role not null check (role <> 'owner'),
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canvas_id, email)
);
create index canvas_invitations_email_status_idx
  on public.canvas_invitations (email, status, expires_at);

create table public.canvas_updates (
  id bigint generated always as identity primary key,
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  update_data bytea not null check (octet_length(update_data) > 0),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (canvas_id, sequence)
);
create index canvas_updates_canvas_created_idx
  on public.canvas_updates (canvas_id, created_at);

create table public.canvas_snapshots (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  version bigint not null check (version > 0),
  last_sequence bigint not null check (last_sequence >= 0),
  state bytea not null check (octet_length(state) > 0),
  state_hash text not null check (char_length(state_hash) between 32 and 128),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (canvas_id, version),
  unique (canvas_id, last_sequence)
);
create index canvas_snapshots_canvas_latest_idx
  on public.canvas_snapshots (canvas_id, version desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 100000),
  status public.comment_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_canvas_created_idx
  on public.comments (canvas_id, created_at, id);

create table public.comment_targets (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  target_object_id uuid not null,
  created_at timestamptz not null default now(),
  unique (comment_id, target_object_id)
);
create index comment_targets_object_idx
  on public.comment_targets (target_object_id, comment_id);

create table public.comment_replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comment_replies_comment_created_idx
  on public.comment_replies (comment_id, created_at, id);

create table public.comment_prompts (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null unique references public.comments (id) on delete cascade,
  kind public.comment_prompt_kind not null,
  minimum integer,
  maximum integer,
  created_at timestamptz not null default now(),
  check (
    (kind = 'rating' and minimum is not null and maximum is not null and minimum < maximum)
    or (kind <> 'rating' and minimum is null and maximum is null)
  )
);

create table public.comment_responses (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.comment_prompts (id) on delete cascade,
  responder_id uuid not null references public.profiles (id) on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prompt_id, responder_id)
);

create table public.ai_change_sets (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  request_id text check (request_id is null or char_length(request_id) <= 255),
  status public.ai_change_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_change_sets_canvas_created_idx
  on public.ai_change_sets (canvas_id, created_at desc);

create table public.ai_object_changes (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null references public.ai_change_sets (id) on delete cascade,
  object_id uuid not null,
  before_state jsonb,
  after_state jsonb,
  affected_fields text[] not null check (cardinality(affected_fields) > 0),
  explanation text not null default '' check (char_length(explanation) <= 10000),
  created_at timestamptz not null default now(),
  check (before_state is not null or after_state is not null),
  unique (change_set_id, object_id)
);

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  object_change_id uuid not null references public.ai_object_changes (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  decision public.review_decision_kind not null,
  note text check (note is null or char_length(note) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (object_change_id, reviewer_id)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stories_canvas_created_idx
  on public.stories (canvas_id, created_at desc);

create table public.story_scenes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  position integer not null check (position >= 0),
  target jsonb not null,
  camera jsonb not null,
  narration text check (narration is null or char_length(narration) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, position)
);

create table public.starter_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 500),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Participant')
  );
  return new;
end;
$$;

create trigger auth_user_created_profile
  after insert on auth.users
  for each row execute function private.create_profile_for_user();

create function private.create_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.canvas_members (canvas_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger canvas_created_owner_membership
  after insert on public.canvases
  for each row execute function private.create_owner_membership();

create function private.protect_canvas_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'canvas owner cannot be changed';
  end if;
  return new;
end;
$$;

create trigger canvas_owner_immutable
  before update on public.canvases
  for each row execute function private.protect_canvas_owner();

create function private.protect_owner_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner'
    and exists (select 1 from public.canvases where id = old.canvas_id)
    and (tg_op = 'DELETE' or new.role <> 'owner') then
    raise exception 'canvas owner membership cannot be removed or demoted';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger canvas_owner_membership_immutable
  before update or delete on public.canvas_members
  for each row execute function private.protect_owner_membership();

create function private.canvas_role(target_canvas_id uuid, target_user_id uuid default auth.uid())
returns public.canvas_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.canvas_members
  where canvas_id = target_canvas_id and user_id = target_user_id;
$$;

create function private.has_canvas_role(target_canvas_id uuid, allowed_roles public.canvas_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.canvas_role(target_canvas_id) = any(allowed_roles), false);
$$;

create function private.shares_canvas(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.canvas_members mine
    join public.canvas_members theirs on theirs.canvas_id = mine.canvas_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user_id
  );
$$;

create function private.comment_canvas(target_comment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select canvas_id from public.comments where id = target_comment_id;
$$;

create function private.is_comment_author(target_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.comments
    where id = target_comment_id and author_id = auth.uid()
  );
$$;

create function private.prompt_canvas(target_prompt_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.canvas_id
  from public.comment_prompts p
  join public.comments c on c.id = p.comment_id
  where p.id = target_prompt_id;
$$;

create function private.change_set_canvas(target_change_set_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select canvas_id from public.ai_change_sets where id = target_change_set_id;
$$;

create function private.object_change_canvas(target_object_change_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cs.canvas_id
  from public.ai_object_changes oc
  join public.ai_change_sets cs on cs.id = oc.change_set_id
  where oc.id = target_object_change_id;
$$;

create function private.story_canvas(target_story_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select canvas_id from public.stories where id = target_story_id;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'canvases', 'canvas_members', 'canvas_invitations',
    'canvas_updates', 'canvas_snapshots', 'comments', 'comment_targets',
    'comment_replies', 'comment_prompts', 'comment_responses', 'ai_change_sets',
    'ai_object_changes', 'review_decisions', 'stories', 'story_scenes',
    'starter_templates'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

grant usage, select on all sequences in schema public to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_canvas(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy canvases_select on public.canvases for select to authenticated
  using (private.canvas_role(id) is not null);
create policy canvases_insert on public.canvases for insert to authenticated
  with check (owner_id = auth.uid());
create policy canvases_update on public.canvases for update to authenticated
  using (private.has_canvas_role(id, array['owner', 'editor']::public.canvas_role[]))
  with check (private.has_canvas_role(id, array['owner', 'editor']::public.canvas_role[]));
create policy canvases_delete on public.canvases for delete to authenticated
  using (private.has_canvas_role(id, array['owner']::public.canvas_role[]));

create policy canvas_members_select on public.canvas_members for select to authenticated
  using (private.canvas_role(canvas_id) is not null);
create policy canvas_members_insert on public.canvas_members for insert to authenticated
  with check (role <> 'owner' and private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]));
create policy canvas_members_update on public.canvas_members for update to authenticated
  using (role <> 'owner' and private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]))
  with check (role <> 'owner' and private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]));
create policy canvas_members_delete on public.canvas_members for delete to authenticated
  using (role <> 'owner' and private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]));

create policy canvas_invitations_owner_all on public.canvas_invitations for all to authenticated
  using (private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]))
  with check (invited_by = auth.uid() and private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]));

create policy canvas_updates_select on public.canvas_updates for select to authenticated
  using (private.canvas_role(canvas_id) is not null);
create policy canvas_updates_insert on public.canvas_updates for insert to authenticated
  with check (actor_id = auth.uid() and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[]));

create policy canvas_snapshots_select on public.canvas_snapshots for select to authenticated
  using (private.canvas_role(canvas_id) is not null);
create policy canvas_snapshots_insert on public.canvas_snapshots for insert to authenticated
  with check (created_by = auth.uid() and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[]));

create policy comments_select on public.comments for select to authenticated
  using (private.canvas_role(canvas_id) is not null);
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and private.has_canvas_role(canvas_id, array['owner', 'editor', 'commenter']::public.canvas_role[]));
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid() and private.has_canvas_role(canvas_id, array['owner', 'editor', 'commenter']::public.canvas_role[]))
  with check (author_id = auth.uid() and private.has_canvas_role(canvas_id, array['owner', 'editor', 'commenter']::public.canvas_role[]));
create policy comments_delete on public.comments for delete to authenticated
  using (
    private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[])
    or (
      author_id = auth.uid()
      and private.has_canvas_role(canvas_id, array['editor', 'commenter']::public.canvas_role[])
    )
  );

create policy comment_targets_select on public.comment_targets for select to authenticated
  using (private.canvas_role(private.comment_canvas(comment_id)) is not null);
create policy comment_targets_write on public.comment_targets for all to authenticated
  using (
    private.is_comment_author(comment_id)
    and private.has_canvas_role(private.comment_canvas(comment_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  )
  with check (
    private.is_comment_author(comment_id)
    and private.has_canvas_role(private.comment_canvas(comment_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  );

create policy comment_replies_select on public.comment_replies for select to authenticated
  using (private.canvas_role(private.comment_canvas(comment_id)) is not null);
create policy comment_replies_insert on public.comment_replies for insert to authenticated
  with check (author_id = auth.uid() and private.has_canvas_role(private.comment_canvas(comment_id), array['owner', 'editor', 'commenter']::public.canvas_role[]));
create policy comment_replies_update on public.comment_replies for update to authenticated
  using (
    author_id = auth.uid()
    and private.has_canvas_role(private.comment_canvas(comment_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  )
  with check (
    author_id = auth.uid()
    and private.has_canvas_role(private.comment_canvas(comment_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  );
create policy comment_replies_delete on public.comment_replies for delete to authenticated
  using (
    private.has_canvas_role(private.comment_canvas(comment_id), array['owner']::public.canvas_role[])
    or (
      author_id = auth.uid()
      and private.has_canvas_role(private.comment_canvas(comment_id), array['editor', 'commenter']::public.canvas_role[])
    )
  );

create policy comment_prompts_select on public.comment_prompts for select to authenticated
  using (private.canvas_role(private.comment_canvas(comment_id)) is not null);
create policy comment_prompts_write on public.comment_prompts for all to authenticated
  using (
    private.is_comment_author(comment_id)
    and private.has_canvas_role(private.comment_canvas(comment_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  )
  with check (
    private.is_comment_author(comment_id)
    and private.has_canvas_role(private.comment_canvas(comment_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  );

create policy comment_responses_select on public.comment_responses for select to authenticated
  using (private.canvas_role(private.prompt_canvas(prompt_id)) is not null);
create policy comment_responses_insert on public.comment_responses for insert to authenticated
  with check (responder_id = auth.uid() and private.has_canvas_role(private.prompt_canvas(prompt_id), array['owner', 'editor', 'commenter']::public.canvas_role[]));
create policy comment_responses_update on public.comment_responses for update to authenticated
  using (
    responder_id = auth.uid()
    and private.has_canvas_role(private.prompt_canvas(prompt_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  )
  with check (
    responder_id = auth.uid()
    and private.has_canvas_role(private.prompt_canvas(prompt_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  );
create policy comment_responses_delete on public.comment_responses for delete to authenticated
  using (
    responder_id = auth.uid()
    and private.has_canvas_role(private.prompt_canvas(prompt_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  );

create policy ai_change_sets_select on public.ai_change_sets for select to authenticated
  using (private.canvas_role(canvas_id) is not null);
create policy ai_change_sets_insert on public.ai_change_sets for insert to authenticated
  with check (requested_by = auth.uid() and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[]));
create policy ai_change_sets_update on public.ai_change_sets for update to authenticated
  using (private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[]))
  with check (private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[]));
create policy ai_change_sets_delete on public.ai_change_sets for delete to authenticated
  using (private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]));

create policy ai_object_changes_select on public.ai_object_changes for select to authenticated
  using (private.canvas_role(private.change_set_canvas(change_set_id)) is not null);
create policy ai_object_changes_write on public.ai_object_changes for all to authenticated
  using (private.has_canvas_role(private.change_set_canvas(change_set_id), array['owner', 'editor']::public.canvas_role[]))
  with check (private.has_canvas_role(private.change_set_canvas(change_set_id), array['owner', 'editor']::public.canvas_role[]));

create policy review_decisions_select on public.review_decisions for select to authenticated
  using (private.canvas_role(private.object_change_canvas(object_change_id)) is not null);
create policy review_decisions_insert on public.review_decisions for insert to authenticated
  with check (reviewer_id = auth.uid() and private.has_canvas_role(private.object_change_canvas(object_change_id), array['owner', 'editor', 'commenter']::public.canvas_role[]));
create policy review_decisions_update on public.review_decisions for update to authenticated
  using (
    reviewer_id = auth.uid()
    and private.has_canvas_role(private.object_change_canvas(object_change_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  )
  with check (
    reviewer_id = auth.uid()
    and private.has_canvas_role(private.object_change_canvas(object_change_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  );
create policy review_decisions_delete on public.review_decisions for delete to authenticated
  using (
    reviewer_id = auth.uid()
    and private.has_canvas_role(private.object_change_canvas(object_change_id), array['owner', 'editor', 'commenter']::public.canvas_role[])
  );

create policy stories_select on public.stories for select to authenticated
  using (private.canvas_role(canvas_id) is not null);
create policy stories_insert on public.stories for insert to authenticated
  with check (author_id = auth.uid() and private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[]));
create policy stories_update on public.stories for update to authenticated
  using (private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[]))
  with check (private.has_canvas_role(canvas_id, array['owner', 'editor']::public.canvas_role[]));
create policy stories_delete on public.stories for delete to authenticated
  using (private.has_canvas_role(canvas_id, array['owner']::public.canvas_role[]));

create policy story_scenes_select on public.story_scenes for select to authenticated
  using (private.canvas_role(private.story_canvas(story_id)) is not null);
create policy story_scenes_write on public.story_scenes for all to authenticated
  using (private.has_canvas_role(private.story_canvas(story_id), array['owner', 'editor']::public.canvas_role[]))
  with check (private.has_canvas_role(private.story_canvas(story_id), array['owner', 'editor']::public.canvas_role[]));

create policy starter_templates_select on public.starter_templates for select to authenticated
  using (owner_id = auth.uid());
create policy starter_templates_insert on public.starter_templates for insert to authenticated
  with check (owner_id = auth.uid());
create policy starter_templates_update on public.starter_templates for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy starter_templates_delete on public.starter_templates for delete to authenticated
  using (owner_id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'canvases', 'canvas_members', 'canvas_invitations', 'comments',
    'comment_replies', 'comment_responses', 'ai_change_sets', 'review_decisions',
    'stories', 'story_scenes', 'starter_templates'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;
