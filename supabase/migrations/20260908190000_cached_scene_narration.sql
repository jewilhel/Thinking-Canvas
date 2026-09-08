-- Synthesized narration is a disposable, private cache of the saved script.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scene-narration', 'scene-narration', false, 52428800, array['audio/mpeg'])
on conflict (id) do nothing;

create table public.scene_narration_audio (
  scene_id uuid primary key references public.story_scenes(id) on delete cascade,
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  version uuid not null default extensions.gen_random_uuid(),
  state text not null default 'pending' check (state in ('pending', 'generating', 'ready', 'failed')),
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
create table public.scene_narration_audio_cleanup (
  path text primary key,
  canvas_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.scene_narration_audio enable row level security;
alter table public.scene_narration_audio_cleanup enable row level security;
revoke all on public.scene_narration_audio, public.scene_narration_audio_cleanup from anon, authenticated;
grant all on public.scene_narration_audio, public.scene_narration_audio_cleanup to service_role;

create function private.invalidate_scene_narration_audio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cached public.scene_narration_audio%rowtype;
  scene_canvas uuid;
begin
  if tg_op = 'UPDATE' and new.narration is not distinct from old.narration
    and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  select * into cached from public.scene_narration_audio where scene_id = old.id;
  if found then
    insert into public.scene_narration_audio_cleanup(path, canvas_id)
    values (cached.canvas_id::text || '/' || cached.scene_id::text || '/' || cached.version::text || '.mp3', cached.canvas_id)
    on conflict do nothing;
    delete from public.scene_narration_audio where scene_id = old.id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.deleted_at is null and nullif(btrim(new.narration), '') is not null then
    select canvas_id into scene_canvas from public.stories where id = new.story_id and kind = 'general';
    if found then
      insert into public.scene_narration_audio(scene_id, canvas_id) values (new.id, scene_canvas);
    end if;
  end if;
  return new;
end;
$$;

create trigger scene_narration_audio_invalidation
after insert or update of narration, deleted_at or delete on public.story_scenes
for each row execute function private.invalidate_scene_narration_audio();

insert into public.scene_narration_audio(scene_id, canvas_id)
select scene.id, story.canvas_id from public.story_scenes scene
join public.stories story on story.id = scene.story_id
where story.kind = 'general' and scene.deleted_at is null and nullif(btrim(scene.narration), '') is not null;
