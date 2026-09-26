-- Product-owner default for new canvases. Existing explicit choices are retained.
alter table public.canvas_ai_settings alter column enabled set default true;
alter table public.canvas_ai_settings alter column authority set default 'trusted_editor';

create function private.initialize_canvas_ai_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.canvas_ai_settings(canvas_id, enabled, authority, changed_by)
  values (new.id, true, 'trusted_editor', new.owner_id);
  return new;
end;
$$;
revoke all on function private.initialize_canvas_ai_settings() from public, anon, authenticated;
create trigger initialize_canvas_ai_settings
after insert on public.canvases
for each row execute function private.initialize_canvas_ai_settings();
