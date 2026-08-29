create or replace function private.cancel_comment_ai_runs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.ai_runs
    set projection_metadata = case
          when invoking_comment_id = old.id
            then projection_metadata - 'evidence'
          else projection_metadata
        end,
        status = case
          when status in ('queued', 'projecting', 'thinking', 'tool_pending', 'applying')
            then 'cancelled'::public.ai_run_status
          else status
        end,
        cancelled_at = case
          when status in ('queued', 'projecting', 'thinking', 'tool_pending', 'applying')
            then now()
          else cancelled_at
        end,
        error_code = case
          when status in ('queued', 'projecting', 'thinking', 'tool_pending', 'applying')
            then 'source_thread_deleted'
          else error_code
        end,
        invoking_reply_id = case
          when invoking_comment_id = old.id then null
          else invoking_reply_id
        end,
        invoking_comment_id = case
          when invoking_comment_id = old.id then null
          else invoking_comment_id
        end,
        output_reply_id = case
          when output_comment_id = old.id then null
          else output_reply_id
        end,
        output_comment_id = case
          when output_comment_id = old.id then null
          else output_comment_id
        end,
        updated_at = now()
    where invoking_comment_id = old.id or output_comment_id = old.id;
  elsif old.status = 'open' and new.status <> 'open' then
    update public.ai_runs
    set status = 'cancelled',
        cancelled_at = now(),
        error_code = 'source_thread_closed',
        updated_at = now()
    where invoking_comment_id = old.id
      and status in ('queued', 'projecting', 'thinking', 'tool_pending', 'applying');
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
