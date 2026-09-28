import type { CommentThread } from "./comment-model";

export function groupCommentHistory(threads: CommentThread[]) {
  const entries: {
    key: string;
    sessionId: string | null;
    threads: CommentThread[];
  }[] = [];
  const sessions = new Map<string, (typeof entries)[number]>();
  for (const thread of threads) {
    if (!thread.voiceSessionId) {
      entries.push({ key: thread.id, sessionId: null, threads: [thread] });
      continue;
    }
    let entry = sessions.get(thread.voiceSessionId);
    if (!entry) {
      entry = {
        key: `voice-${thread.voiceSessionId}`,
        sessionId: thread.voiceSessionId,
        threads: [],
      };
      sessions.set(thread.voiceSessionId, entry);
      entries.push(entry);
    }
    entry.threads.push(thread);
  }
  return entries;
}
