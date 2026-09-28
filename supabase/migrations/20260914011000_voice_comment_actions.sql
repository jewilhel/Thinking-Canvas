create or replace function private.guard_voice_tool_execution()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_voice_run_active(new.run_id);
  if exists (select 1 from public.voice_delegations where ai_run_id = new.run_id)
    and new.tool_name not in ('create_contextual_comment', 'execute_canvas_commands', 'stage_canvas_changes', 'manage_comment_thread') then
    raise exception 'Voice task no longer permits this action' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.manage_voice_comment(
  target_run_id uuid, target_call_key text, target_command_id uuid,
  target_action text, target_comment_id uuid, target_body text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.ai_runs; c public.comments; previous public.ai_tool_executions;
  result_id uuid; actor_role public.canvas_role;
begin
  select * into r from public.ai_runs where id = target_run_id for update;
  if not found or auth.uid() is distinct from r.requested_by
    or not exists(select 1 from public.voice_delegations where ai_run_id = r.id)
    or r.status not in ('projecting','thinking','tool_pending') then
    raise exception 'Voice comment action is not authorized' using errcode = '42501';
  end if;
  perform private.assert_voice_run_active(r.id);
  if target_action not in ('create','reply','resolve','dismiss','reopen','delete')
    or target_call_key is null or char_length(target_call_key) not between 1 and 255
    or target_command_id is null then
    raise exception 'Invalid comment action' using errcode = '22023';
  end if;
  select * into previous from public.ai_tool_executions where run_id = r.id and call_key = target_call_key;
  if found then
    if previous.tool_name <> 'manage_comment_thread' or previous.command_id <> target_command_id or previous.outcome <> 'succeeded' then
      raise exception 'Comment action identity conflict' using errcode = '23505';
    end if;
    return previous.comment_id;
  end if;
  if target_action in ('create','reply') and (target_body is null or char_length(trim(target_body)) not between 1 and 100000) then
    raise exception 'Comment text is required' using errcode = '22023';
  end if;
  if target_action <> 'create' then
    select * into c from public.comments where id = target_comment_id and canvas_id = r.canvas_id for update;
    if not found or c.id = r.invoking_comment_id then
      raise exception 'The target comment is not available for this action' using errcode = '42501';
    end if;
  end if;
  if target_action = 'create' then
    select t.comment_id into result_id from public.create_comment_thread(
      target_canvas_id => r.canvas_id, target_client_command_id => target_command_id,
      target_body => target_body, target_anchor_x => 0, target_anchor_y => 0,
      target_include_primary_ai => false
    ) t;
  elsif target_action = 'reply' then
    perform public.create_comment_reply(target_comment_id => c.id,
      target_client_command_id => target_command_id, target_body => target_body,
      target_author_kind => 'ai', target_author_key => 'primary-ai',
      target_recipient_user_ids => null, target_include_primary_ai => false);
    result_id := c.id;
  elsif target_action in ('resolve','dismiss') then
    perform public.transition_comment_status(c.id, case when target_action = 'resolve' then 'resolved'::public.comment_status else 'dismissed'::public.comment_status end);
    result_id := c.id;
  elsif target_action = 'reopen' then
    actor_role := private.canvas_role(r.canvas_id);
    if not coalesce(actor_role in ('owner','editor') or (actor_role = 'commenter' and c.author_id = auth.uid()), false) then
      raise exception 'Reopening this comment is not permitted' using errcode = '42501';
    end if;
    update public.comments set status = 'open', updated_at = now() where id = c.id;
    result_id := c.id;
  else
    perform public.delete_comment_thread(c.id);
    result_id := null;
  end if;
  insert into public.ai_tool_executions(run_id,call_key,tool_name,command_id,comment_id,outcome)
    values(r.id,target_call_key,'manage_comment_thread',target_command_id,result_id,'succeeded');
  return result_id;
end;
$$;
revoke all on function public.manage_voice_comment(uuid,text,uuid,text,uuid,text) from public,anon;
grant execute on function public.manage_voice_comment(uuid,text,uuid,text,uuid,text) to authenticated;
