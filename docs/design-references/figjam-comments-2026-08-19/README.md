# FigJam comment interaction references

Source: Five FigJam screenshots supplied by the product owner on 2026-08-19 for Milestone 3 — Comments and structured feedback.

These images establish interaction and information-hierarchy principles for Thinking Canvas. They are not instructions to reproduce FigJam pixel for pixel, use Figma branding, copy exact colors or dimensions, or implement every control visible in the source product.

## Reference sequence

1. [Anchored comment composer](01-anchored-comment-composer.png) — a composer opens next to the selected target, and the target remains visibly connected to the comment marker.
2. [Collapsed comment avatar](02-collapsed-comment-avatar.png) — an inactive thread reduces to a compact author marker at the target edge rather than leaving a full panel open.
3. [Open comment thread](03-open-comment-thread.png) — selecting the marker opens a contextual thread card with clear header actions, author identity, timestamp, body, and a compact reply field.
4. [Expanded reply composer](04-expanded-reply-composer.png) — focusing Reply expands the editor progressively while the existing thread and target remain visible.
5. [Thread with reply](05-thread-with-reply.png) — submitted replies appear as a readable chronological exchange, and the composer returns to a compact ready state.

## Interaction principles to carry into Thinking Canvas

- Keep a visible spatial relationship between the target, its compact marker, and the open thread.
- Let an inactive thread collapse to a small participant indicator so comments do not dominate the canvas.
- Open the authoring and thread surfaces contextually near the target when viewport space permits; clamp or fall back to the shared panel at constrained sizes.
- Use progressive disclosure: compact marker, open thread, compact reply field, then expanded reply composer on focus.
- Make author identity, relative time, comment text, replies, and lifecycle state visually distinct and easy to scan.
- Keep thread overflow actions, resolve, dismiss or close, and composer submission separate and clearly labeled for keyboard and assistive-technology users.
- Preserve the target and prior exchange while composing a reply; do not replace the thread with an editor-only state.
- Return the reply composer to a compact state after submission while keeping the new reply visible.

## Boundaries

- Apply Thinking Canvas tokens, typography, iconography, accessibility behavior, and original visual identity.
- An avatar may use a profile image when the product has one, with initials as the required fallback; these references do not create a profile-image requirement.
- Emoji, mentions, image attachments, reactions, notifications, and other controls visible in FigJam remain outside Milestone 3 unless the master ledger explicitly promotes them.
- The references do not change the approved relational comment model, Yjs canvas boundary, role permissions, structured-prompt requirements, or milestone exit gate.
