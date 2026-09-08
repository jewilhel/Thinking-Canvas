create function public.create_document_comment_thread(
  target_canvas_id uuid,
  target_client_command_id uuid,
  target_body text,
  target_ordered_context_ids uuid[],
  target_prompt_kind public.comment_prompt_kind,
  target_author_kind public.comment_author_kind,
  target_author_key text,
  target_recipient_user_ids uuid[],
  target_include_primary_ai boolean,
  target_document_object_id uuid,
  target_document_relative_anchor text,
  target_document_relative_head text,
  target_document_quoted_text text,
  target_include_document_context boolean,
  target_include_selected_text_context boolean
)
returns table (comment_id uuid, created boolean, ai_run_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_comment_id uuid;
  was_created boolean;
  created_ai_run_id uuid;
  saved_include_document boolean;
  saved_include_selected_text boolean;
begin
  select result.comment_id, result.created, result.ai_run_id
  into created_comment_id, was_created, created_ai_run_id
  from public.create_comment_thread(
    target_canvas_id => target_canvas_id,
    target_client_command_id => target_client_command_id,
    target_body => target_body,
    target_object_ids => array[]::uuid[],
    target_prompt_kind => target_prompt_kind,
    target_author_kind => target_author_kind,
    target_author_key => target_author_key,
    target_recipient_user_ids => target_recipient_user_ids,
    target_include_primary_ai => target_include_primary_ai,
    target_ordered_context_ids => target_ordered_context_ids,
    target_document_object_id => target_document_object_id,
    target_document_relative_anchor => target_document_relative_anchor,
    target_document_relative_head => target_document_relative_head,
    target_document_quoted_text => target_document_quoted_text
  ) result;

  if was_created then
    update public.comment_document_targets
    set
      include_document_context = target_include_document_context,
      include_selected_text_context = target_include_selected_text_context,
      updated_at = now()
    where public.comment_document_targets.comment_id = created_comment_id;
  else
    select include_document_context, include_selected_text_context
    into saved_include_document, saved_include_selected_text
    from public.comment_document_targets
    where public.comment_document_targets.comment_id = created_comment_id;

    if saved_include_document is distinct from target_include_document_context
      or saved_include_selected_text is distinct from target_include_selected_text_context then
      raise exception 'The comment command ID was reused with different content.' using errcode = '23505';
    end if;
  end if;

  return query select created_comment_id, was_created, created_ai_run_id;
end;
$$;

revoke all on function public.create_document_comment_thread(
  uuid, uuid, text, uuid[], public.comment_prompt_kind,
  public.comment_author_kind, text, uuid[], boolean, uuid,
  text, text, text, boolean, boolean
) from public, anon;
grant execute on function public.create_document_comment_thread(
  uuid, uuid, text, uuid[], public.comment_prompt_kind,
  public.comment_author_kind, text, uuid[], boolean, uuid,
  text, text, text, boolean, boolean
) to authenticated;

comment on function public.create_document_comment_thread(
  uuid, uuid, text, uuid[], public.comment_prompt_kind,
  public.comment_author_kind, text, uuid[], boolean, uuid,
  text, text, text, boolean, boolean
) is 'Atomically creates a document range comment, its optional AI run, and the selected AI context flags.';
