"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { CommentThread } from "@/comments/comment-model";
import type { useCanvasComments } from "@/comments/use-canvas-comments";
export type CommentService = ReturnType<typeof useCanvasComments>;

export type CommentAnchor = {
  left: number;
  top: number;
  documentObjectId?: string;
};
type Workspace = {
  service: CommentService | null;
  setService: (service: CommentService) => void;
  active: string | null;
  docked: boolean;
  threadId: string | null;
  anchor: CommentAnchor | null;
  threads: CommentThread[];
  drafts: Record<string, unknown>;
  dimensions: { width: number; height: number } | null;
  setDimensions: (dimensions: { width: number; height: number }) => void;
  registerAnchors: (
    documentId: string,
    resolver: (threadId: string) => CommentAnchor | null,
  ) => () => void;
  getAnchor: (thread: CommentThread) => CommentAnchor | null;
  show: (active: string | null) => void;
  openThread: (id: string, anchor?: CommentAnchor) => void;
  finishCreation: (source: string, id: string, anchor?: CommentAnchor) => void;
  setDocked: (docked: boolean) => void;
  setThreads: (threads: CommentThread[]) => void;
  saveDraft: (key: string, value: unknown) => void;
};
function createWorkspace(
  initialActive: string | null = null,
  initialService: CommentService | null = null,
) {
  const resolvers = new Map<
    string,
    (threadId: string) => CommentAnchor | null
  >();
  return createStore<Workspace>((set) => ({
    service: initialService,
    setService: (service) => set({ service, threads: service.threads }),
    active: initialActive,
    docked: false,
    threadId: null,
    anchor: null,
    threads: [],
    drafts: {},
    dimensions: null,
    setDimensions: (dimensions) => set({ dimensions }),
    registerAnchors: (id, resolver) => {
      resolvers.set(id, resolver);
      return () => {
        if (resolvers.get(id) === resolver) resolvers.delete(id);
      };
    },
    getAnchor: (thread) =>
      thread.documentRange
        ? (resolvers.get(thread.documentRange.documentObjectId)?.(thread.id) ??
          null)
        : null,
    show: (active) => set({ active }),
    openThread: (threadId, anchor) =>
      set({ active: "thread", threadId, anchor: anchor ?? null }),
    finishCreation: (source, threadId, anchor) =>
      set((state) =>
        state.active === source
          ? { active: "thread", threadId, anchor: anchor ?? null }
          : state,
      ),
    setDocked: (docked) => set({ docked }),
    setThreads: (threads) => set({ threads }),
    saveDraft: (key, value) =>
      set((state) => ({ drafts: { ...state.drafts, [key]: value } })),
  }));
}
const Context = createContext<ReturnType<typeof createWorkspace> | null>(null);
export function CommentWorkspaceProvider({
  children,
  initialActive = null,
  initialService = null,
}: {
  children: ReactNode;
  initialActive?: string | null;
  initialService?: CommentService | null;
}) {
  const [store] = useState(() =>
    createWorkspace(initialActive, initialService),
  );
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useCommentWorkspace() {
  const context = useContext(Context);
  // Isolated render/test harnesses get a local workspace, never a global singleton.
  const [local] = useState(createWorkspace);
  return useStore(context ?? local);
}
export function useCommentDraft<T>(
  key: string,
  initial: T,
): [T, (value: T) => void] {
  const workspace = useCommentWorkspace();
  return [
    key in workspace.drafts ? (workspace.drafts[key] as T) : initial,
    (value) => workspace.saveDraft(key, value),
  ];
}
