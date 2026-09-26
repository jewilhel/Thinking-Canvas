create table public.voice_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_name text not null check (char_length(preferred_name) between 1 and 80)
);
alter table public.voice_user_preferences enable row level security;
revoke all on public.voice_user_preferences from anon;
grant select, insert, update, delete on public.voice_user_preferences to authenticated;
grant all on public.voice_user_preferences to service_role;
create policy voice_preferences_own on public.voice_user_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
