alter table public.story_scenes add column caption_layout jsonb;
alter table public.story_scenes add constraint valid_caption_layout check (
  caption_layout is null or (
    jsonb_typeof(caption_layout) = 'object'
    and caption_layout ?& array['x','y','width','height']
    and jsonb_typeof(caption_layout->'x') = 'number'
    and jsonb_typeof(caption_layout->'y') = 'number'
    and jsonb_typeof(caption_layout->'width') = 'number'
    and jsonb_typeof(caption_layout->'height') = 'number'
    and (caption_layout->>'width')::numeric > 0
    and (caption_layout->>'height')::numeric > 0
  )
);
create function public.update_scene_caption_layout(target_canvas_id uuid, target_scene_id uuid, target_expected_revision bigint, target_layout jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare selected_story public.stories%rowtype; next_revision bigint;
begin
  selected_story := private.lock_primary_story(target_canvas_id, target_expected_revision);
  update public.story_scenes set caption_layout = target_layout
  where id = target_scene_id and story_id = selected_story.id and deleted_at is null;
  if not found then raise exception 'Scene unavailable.' using errcode = 'P0002'; end if;
  update public.stories set revision = revision + 1 where id = selected_story.id returning revision into next_revision;
  return next_revision;
end;
$$;
revoke all on function public.update_scene_caption_layout(uuid,uuid,bigint,jsonb) from public, anon;
grant execute on function public.update_scene_caption_layout(uuid,uuid,bigint,jsonb) to authenticated;
