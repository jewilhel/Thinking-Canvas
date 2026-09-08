-- The worker reads only the saved script and its canvas association. Base tables
-- intentionally do not grant blanket service-role access in this application.
grant select (id, story_id, narration, deleted_at)
  on public.story_scenes to service_role;
grant select (id, canvas_id)
  on public.stories to service_role;
