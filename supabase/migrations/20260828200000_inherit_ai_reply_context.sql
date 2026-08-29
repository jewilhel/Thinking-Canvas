create function private.inherit_ai_reply_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inherited_context_ids uuid[];
begin
  if new.invoking_reply_id is not null then
    select prior_run.ordered_context_ids
    into inherited_context_ids
    from public.ai_runs prior_run
    where prior_run.canvas_id = new.canvas_id
      and prior_run.invoking_comment_id = new.invoking_comment_id
      and cardinality(prior_run.ordered_context_ids) > 0
    order by prior_run.created_at desc, prior_run.id desc
    limit 1;

    if inherited_context_ids is not null then
      new.ordered_context_ids := inherited_context_ids;
    else
      new.ordered_context_ids := coalesce(
        new.ordered_context_ids,
        array[]::uuid[]
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger ai_runs_inherit_reply_context
  before insert on public.ai_runs
  for each row execute function private.inherit_ai_reply_context();
