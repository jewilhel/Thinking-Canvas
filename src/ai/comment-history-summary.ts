type Message = {
  id: string;
  authorKind: string;
  body: string;
  createdAt: string;
};

// Keep speaker boundaries and the latest turns. Cutting from the front of a
// growing conversation discarded the suggestion that an approval referred to.
export function commentHistorySummary(thread: {
  body: string;
  authorKind: string;
  replies: Message[];
}) {
  const limit = 10_000;
  const initial = `${thread.authorKind}: ${thread.body}`;
  const recent = [...thread.replies]
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .map((reply) => `${reply.authorKind}: ${reply.body}`);
  const all = [initial, ...recent].join("\n\n");
  if (all.length <= limit) return all;
  const prefix = `${initial.slice(0, 1_000)}\n\n[Earlier context truncated]\n\n`;
  return prefix + recent.join("\n\n").slice(-(limit - prefix.length));
}
