create table public.voice_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 16000)
);
alter table public.voice_user_settings enable row level security;
revoke all on public.voice_user_settings from anon;
grant select, insert, update, delete on public.voice_user_settings to authenticated;
create policy voice_settings_own on public.voice_user_settings for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
