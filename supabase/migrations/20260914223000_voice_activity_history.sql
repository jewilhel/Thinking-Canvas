-- Display provenance only. No conversation text or new access grants.
create function public.tag_voice_activity_run()
returns trigger language plpgsql security definer set search_path = '' as $$
declare session_id uuid;
begin
  select d.session_id into session_id from public.voice_delegations d where d.id = new.idempotency_key;
  if session_id is not null then
    new.projection_metadata := coalesce(new.projection_metadata, '{}'::jsonb) || jsonb_build_object('voiceSessionId', session_id);
  end if;
  return new;
end;
$$;
revoke all on function public.tag_voice_activity_run() from public, anon, authenticated;
create trigger tag_voice_activity_run before insert on public.ai_runs
for each row execute function public.tag_voice_activity_run();

update public.ai_runs r
set projection_metadata = coalesce(r.projection_metadata, '{}'::jsonb) || jsonb_build_object('voiceSessionId', d.session_id)
from public.voice_delegations d
where r.id = d.ai_run_id or r.idempotency_key = d.id;
