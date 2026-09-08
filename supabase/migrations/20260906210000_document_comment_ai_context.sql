alter table public.comment_document_targets
  add column include_document_context boolean not null default true,
  add column include_selected_text_context boolean not null default true;

comment on column public.comment_document_targets.include_document_context is
  'Whether the invoking document body is included in the AI projection.';

comment on column public.comment_document_targets.include_selected_text_context is
  'Whether the anchored quote is included in the AI projection. The durable range remains attached to the comment.';
