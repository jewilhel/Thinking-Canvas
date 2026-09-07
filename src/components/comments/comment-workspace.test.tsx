import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommentWorkspaceProvider,
  useCommentWorkspace,
} from "./comment-workspace";
import { CommentPanel, clampCommentPanel } from "./comment-panel";
import { CanvasComments } from "./canvas-comments";
import type { CommentThread } from "@/comments/comment-model";

const fixture = vi.hoisted(() => ({
  threads: [] as CommentThread[],
  noop: vi.fn(),
}));
vi.mock("@/comments/use-canvas-comments", () => ({
  useCanvasComments: () => ({
    threads: fixture.threads,
    collaboration: null,
    loading: false,
    pending: false,
    error: "",
    refresh: fixture.noop,
    execute: fixture.noop,
    setAiSettings: fixture.noop,
    cancelAiRun: fixture.noop,
    retryAiRun: fixture.noop,
  }),
}));
afterEach(cleanup);
function thread(id: string, document = false): CommentThread {
  return {
    id,
    canvasId: "canvas",
    authorId: "owner",
    authorKind: "human",
    authorKey: "owner",
    authorName: id,
    body: `${id} wording`,
    status: "open",
    createdAt: "2026-09-07T00:00:00Z",
    updatedAt: "2026-09-07T00:00:00Z",
    targetObjectIds: [],
    canvasAnchor: document ? null : { x: 150, y: 150 },
    documentRange: document
      ? { documentObjectId: "doc", anchor: "a", head: "h", quote: "selected" }
      : null,
    replies: [],
    recipients: [],
    activeParticipants: [],
    aiRuns: [],
    prompt: null,
  };
}
function Harness() {
  const workspace = useCommentWorkspace();
  return (
    <>
      <button onClick={() => workspace.show("history")}>Open history</button>
      <button
        onClick={() =>
          workspace.finishCreation("document-composer", "document")
        }
      >
        Finish background creation
      </button>
      <button
        onClick={() =>
          workspace.openThread("document", {
            left: 120,
            top: 160,
            documentObjectId: "doc",
          })
        }
      >
        Open highlighted text
      </button>
      <button onClick={() => workspace.openThread("canvas")}>
        Open canvas marker
      </button>
      <CanvasComments
        canvasId="canvas"
        userId="owner"
        canvasRole="owner"
        supabaseUrl="test"
        supabasePublishableKey="test"
        objects={[]}
        selectedIds={[]}
        viewport={{ x: 0, y: 0, scale: 1 }}
        size={{ width: 1024, height: 768 }}
        panelOpen={workspace.active === "history"}
        panelInvoker={null}
        placementActive={false}
        onDismissPanel={fixture.noop}
        onPlacementModeChange={fixture.noop}
        onSelectTargets={fixture.noop}
        onAiTransactionApplied={fixture.noop}
        onUndoAiTransaction={async () => ({ conflicts: 0 })}
        overlayVisible
        onOverlayVisibilityChange={fixture.noop}
      />
    </>
  );
}
describe("shared comment workspace", () => {
  it("replaces docked history with either comment type and retains isolated reply drafts", () => {
    fixture.threads = [thread("canvas"), thread("document", true)];
    render(
      <CommentWorkspaceProvider>
        <Harness />
      </CommentWorkspaceProvider>,
    );
    fireEvent.click(screen.getByText("Open history"));
    fireEvent.click(screen.getByText("Finish background creation"));
    expect(screen.getByRole("heading", { name: "Comments" })).toBeVisible();
    fireEvent.click(screen.getByLabelText("Dock comment panel right"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByText("Open highlighted text"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-docked", "true");
    expect(screen.getByText("document wording")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Reply"), {
      target: { value: "Unsent document reply" },
    });
    fireEvent.click(screen.getByText("Open history"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Comments" })).toBeVisible();
    fireEvent.click(screen.getByText("Open canvas marker"));
    expect(screen.getByLabelText("Reply")).toHaveValue("");
    fireEvent.click(screen.getByText("Open highlighted text"));
    expect(screen.getByLabelText("Reply")).toHaveValue("Unsent document reply");
    fireEvent.click(screen.getByLabelText("Undock comment panel"));
    expect(screen.getByRole("dialog")).toHaveStyle({
      left: "120px",
      top: "160px",
    });
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("dialog")).toBeVisible();
  });
  it("moves and resizes with keyboard controls and clamps to smaller screens", () => {
    render(
      <CommentWorkspaceProvider>
        <CommentPanel
          title="Comment"
          anchor={{ left: 100, top: 100 }}
          onClose={fixture.noop}
        >
          Text
        </CommentPanel>
      </CommentWorkspaceProvider>,
    );
    fireEvent.keyDown(screen.getByLabelText("Move comment panel"), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("dialog")).toHaveStyle({ left: "110px" });
    fireEvent.keyDown(screen.getByLabelText("Resize comment panel"), {
      key: "ArrowDown",
    });
    expect(screen.getByRole("dialog")).toHaveStyle({ height: "450px" });
    expect(
      clampCommentPanel(
        { left: 900, top: -80, width: 600, height: 900 },
        { width: 320, height: 500 },
      ),
    ).toEqual({ left: 8, top: 8, width: 304, height: 484 });
  });
});
