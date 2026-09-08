alter table public.stories
  add column revision bigint not null default 0 check (revision >= 0);

create unique index stories_primary_general_canvas_unique_idx
  on public.stories (canvas_id)
  where kind = 'general';

alter table public.story_scenes
  add column title text;

with ordered_scenes as (
  select
    id,
    row_number() over (partition by story_id order by position, created_at, id) as scene_number
  from public.story_scenes
)
update public.story_scenes scene
set title = 'Scene ' || ordered_scenes.scene_number
from ordered_scenes
where ordered_scenes.id = scene.id;

alter table public.story_scenes
  alter column title set default 'Scene',
  alter column title set not null,
  add constraint story_scenes_title_length
    check (char_length(btrim(title)) between 1 and 120),
  add constraint story_scenes_camera_object
    check (jsonb_typeof(camera) = 'object'),
  add constraint story_scenes_target_object
    check (jsonb_typeof(target) = 'object');

create or replace function public.capture_primary_story_scene(
  target_canvas_id uuid,
  target_title text,
  target_camera jsonb,
  target_region jsonb,
  target_expected_revision bigint default null
)
returns table (
  story_id uuid,
  story_revision bigint,
  scene_id uuid,
  scene_title text,
  scene_position integer,
  scene_camera jsonb,
  scene_target jsonb,
  scene_narration text,
  scene_created_at timestamptz,
  scene_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_story public.stories%rowtype;
  inserted_scene public.story_scenes%rowtype;
  next_position integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not private.has_canvas_role(
    target_canvas_id,
    array['owner', 'editor']::public.canvas_role[]
  ) then
    raise exception 'Story editing requires owner or editor access.' using errcode = '42501';
  end if;

  if char_length(btrim(target_title)) not between 1 and 120 then
    raise exception 'Scene title must contain between 1 and 120 characters.' using errcode = '22023';
  end if;

  select story.*
  into selected_story
  from public.stories story
  where story.canvas_id = target_canvas_id and story.kind = 'general'
  for update;

  if selected_story.id is null then
    begin
      insert into public.stories (canvas_id, author_id, title, kind)
      values (target_canvas_id, auth.uid(), 'Scenes', 'general')
      returning * into selected_story;
    exception when unique_violation then
      select story.*
      into selected_story
      from public.stories story
      where story.canvas_id = target_canvas_id and story.kind = 'general'
      for update;
    end;
  end if;

  if target_expected_revision is not null
     and selected_story.revision <> target_expected_revision then
    raise exception 'The story changed in another session.' using errcode = '40001';
  end if;

  select coalesce(max(scene.position), -1) + 1
  into next_position
  from public.story_scenes scene
  where scene.story_id = selected_story.id;

  insert into public.story_scenes (
    story_id,
    title,
    position,
    target,
    camera
  ) values (
    selected_story.id,
    btrim(target_title),
    next_position,
    target_region,
    target_camera
  )
  returning * into inserted_scene;

  update public.stories story
  set revision = story.revision + 1
  where story.id = selected_story.id
  returning story.revision into story_revision;

  return query select
    selected_story.id,
    story_revision,
    inserted_scene.id,
    inserted_scene.title,
    inserted_scene.position,
    inserted_scene.camera,
    inserted_scene.target,
    inserted_scene.narration,
    inserted_scene.created_at,
    inserted_scene.updated_at;
end;
$$;

revoke all on function public.capture_primary_story_scene(
  uuid,
  text,
  jsonb,
  jsonb,
  bigint
) from public, anon;

grant execute on function public.capture_primary_story_scene(
  uuid,
  text,
  jsonb,
  jsonb,
  bigint
) to authenticated;
