import { z } from "zod";

import { listCanvasObjectsV2 } from "@/canvas/canvas-document";
import { commentCreateCommandSchema } from "@/comments/comment-model";
import { postgresByteaToBytes } from "@/collaboration/canvas-document";
import { buildCompactedSnapshot } from "@/collaboration/persistence";
import { decodeDocumentRelativePosition } from "@/documents/document-range";
import { getAuthenticatedUser } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  const command = commentCreateCommandSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (
    !z.uuid().safeParse(canvasId).success ||
    !command.success ||
    command.data.canvasId !== canvasId ||
    !command.data.documentRange
  ) {
    return Response.json(
      { error: "A valid document range comment is required." },
      { status: 400 },
    );
  }
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  const [snapshot, updates] = await Promise.all([
    supabase
      .from("canvas_snapshots")
      .select("version,last_sequence,state,state_hash")
      .eq("canvas_id", canvasId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("canvas_updates")
      .select("sequence,update_data")
      .eq("canvas_id", canvasId)
      .order("sequence", { ascending: true }),
  ]);
  if (snapshot.error || updates.error) {
    return Response.json(
      { error: "The current document could not be loaded." },
      { status: 409 },
    );
  }
  const compacted = await buildCompactedSnapshot(
    snapshot.data
      ? {
          version: snapshot.data.version,
          lastSequence: snapshot.data.last_sequence,
          state: postgresByteaToBytes(snapshot.data.state),
          stateHash: snapshot.data.state_hash,
        }
      : null,
    (updates.data ?? []).map((row) => ({
      sequence: row.sequence,
      update: postgresByteaToBytes(row.update_data),
    })),
  );
  const range = command.data.documentRange;
  const documentObject = listCanvasObjectsV2(compacted.document).find(
    (object) =>
      object.id === range.documentObjectId &&
      object.type === "document" &&
      object.canvasId === canvasId,
  );
  try {
    decodeDocumentRelativePosition(range.anchor);
    decodeDocumentRelativePosition(range.head);
  } catch {
    return Response.json(
      { error: "The selected document range is invalid." },
      { status: 400 },
    );
  }
  if (!documentObject) {
    return Response.json(
      { error: "The selected document range is no longer available." },
      { status: 409 },
    );
  }
  const args: Database["public"]["Functions"]["create_comment_thread"]["Args"] =
    {
      target_canvas_id: canvasId,
      target_client_command_id: command.data.commandId,
      target_body: command.data.body,
      target_object_ids: [],
      target_ordered_context_ids: command.data.orderedContextIds,
      target_author_kind: command.data.authorKind,
      target_author_key: command.data.authorKey ?? undefined,
      target_prompt_kind: command.data.promptKind ?? undefined,
      target_recipient_user_ids: command.data.routing?.recipientUserIds,
      target_include_primary_ai:
        command.data.routing?.includePrimaryAi ?? undefined,
      target_document_object_id: range.documentObjectId,
      target_document_relative_anchor: range.anchor,
      target_document_relative_head: range.head,
      target_document_quoted_text: range.quote,
    };
  const result = await supabase.rpc("create_comment_thread", args);
  if (result.error || !result.data?.[0]) {
    return Response.json(
      {
        error:
          result.error?.message ?? "The document comment could not be saved.",
      },
      { status: result.error?.code === "42501" ? 403 : 409 },
    );
  }
  return Response.json(result.data[0], {
    headers: { "cache-control": "no-store" },
  });
}
