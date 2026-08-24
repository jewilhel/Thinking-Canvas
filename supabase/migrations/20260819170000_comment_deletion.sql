create function public.delete_comment_thread(target_comment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_comment public.comments%rowtype;
  actor_role public.canvas_role;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select *
  into target_comment
  from public.comments
  where id = target_comment_id
  for update;

  if not found then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;

  actor_role := private.canvas_role(target_comment.canvas_id);
  if not coalesce(
    actor_role is not null
    and (actor_role = 'owner' or target_comment.author_id = actor_id),
    false
  ) then
    raise exception 'Deleting this comment is not permitted.' using errcode = '42501';
  end if;

  delete from public.comments where id = target_comment_id;
  return target_comment_id;
end;
$$;

revoke all on function public.delete_comment_thread(uuid) from public, anon;
grant execute on function public.delete_comment_thread(uuid) to authenticated;
