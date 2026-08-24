create or replace function public.set_comment_prompt(
  target_comment_id uuid,
  target_prompt_kind public.comment_prompt_kind default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_comment public.comments%rowtype;
  actor_role public.canvas_role;
  target_prompt public.comment_prompts%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into target_comment
  from public.comments
  where id = target_comment_id;
  if not found then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;

  actor_role := private.canvas_role(target_comment.canvas_id);
  if not coalesce(
    actor_role in ('owner', 'editor') or target_comment.author_id = actor_id,
    false
  ) then
    raise exception 'Changing this comment prompt is not permitted.' using errcode = '42501';
  end if;
  if target_comment.status <> 'open' then
    raise exception 'Closed comments are read-only.' using errcode = '22023';
  end if;

  select * into target_prompt
  from public.comment_prompts
  where comment_id = target_comment_id;

  if target_prompt_kind is null then
    if found then
      delete from public.comment_prompts where id = target_prompt.id;
    end if;
    update public.comments set updated_at = now() where id = target_comment_id;
    return null;
  end if;

  if found then
    if target_prompt.kind <> target_prompt_kind then
      delete from public.comment_responses where prompt_id = target_prompt.id;
      update public.comment_prompts
      set kind = target_prompt_kind,
          minimum = case when target_prompt_kind = 'rating' then 1 else null end,
          maximum = case when target_prompt_kind = 'rating' then 5 else null end
      where id = target_prompt.id;
    end if;
  else
    insert into public.comment_prompts (comment_id, kind, minimum, maximum)
    values (
      target_comment_id,
      target_prompt_kind,
      case when target_prompt_kind = 'rating' then 1 else null end,
      case when target_prompt_kind = 'rating' then 5 else null end
    )
    returning * into target_prompt;
  end if;

  update public.comments set updated_at = now() where id = target_comment_id;
  return target_prompt.id;
end;
$$;

revoke all on function public.set_comment_prompt(uuid, public.comment_prompt_kind) from public, anon;
grant execute on function public.set_comment_prompt(uuid, public.comment_prompt_kind) to authenticated;
