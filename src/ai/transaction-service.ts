import "server-only";

import { z } from "zod";
import * as Y from "yjs";

import { broadcastAiCanvasUpdate } from "@/ai/realtime-broadcast";
import { buildUndoAiChangeSetUpdate } from "@/ai/review-state";
import {
  bytesToPostgresBytea,
  postgresByteaToBytes,
} from "@/collaboration/canvas-document";
import { buildCompactedSnapshot } from "@/collaboration/persistence";
import { getAuthenticatedUser } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const undoSchema = z.strictObject({
  changeSetId: z.uuid(),
  idempotencyKey: z.uuid(),
});

export class AiTransactionAccessError extends Error {}
export class AiTransactionConflictError extends Error {}

async function loadCurrentCanvas(canvasId: string) {
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
    throw new AiTransactionConflictError(
      "The current canvas could not be loaded.",
    );
  }
  return buildCompactedSnapshot(
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
}

export async function undoAiTransaction(canvasId: string, input: unknown) {
  const parsed = undoSchema.parse(input);
  const user = await getAuthenticatedUser();
  if (!user) throw new AiTransactionAccessError("Authentication required.");
  const supabase = await createClient();
  const { data: changeSet, error } = await supabase
    .from("ai_change_sets")
    .select(
      "id,status,transaction_undone_at,document_object_id,document_undo_update,ai_object_changes(id,object_id,before_state,after_state,affected_fields,created_at)",
    )
    .eq("id", parsed.changeSetId)
    .eq("canvas_id", canvasId)
    .maybeSingle();
  if (error || !changeSet) {
    throw new AiTransactionAccessError("AI change is not accessible.");
  }
  if (changeSet.transaction_undone_at) {
    return { changeSetId: changeSet.id, created: false, conflicts: [] };
  }
  if (changeSet.status !== "applied") {
    throw new AiTransactionConflictError(
      "This AI change can no longer be undone as one transaction.",
    );
  }

  const current = await loadCurrentCanvas(canvasId);
  const undo = buildUndoAiChangeSetUpdate({
    document: current.document,
    objectChanges: [...changeSet.ai_object_changes]
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .map((change) => ({
        id: change.id,
        objectId: change.object_id,
        beforeState: change.before_state,
        afterState: change.after_state,
        affectedFields: change.affected_fields,
      })),
  });
  const beforeUndoVector = Y.encodeStateVector(current.document);
  const undoDocument = new Y.Doc();
  Y.applyUpdate(undoDocument, Y.encodeStateAsUpdate(current.document));
  if (undo.update.length > 2) Y.applyUpdate(undoDocument, undo.update);
  if (changeSet.document_undo_update) {
    Y.applyUpdate(
      undoDocument,
      postgresByteaToBytes(changeSet.document_undo_update),
    );
  }
  const combinedUpdate = Y.encodeStateAsUpdate(undoDocument, beforeUndoVector);
  const update = combinedUpdate.length > 2 ? combinedUpdate : new Uint8Array();
  const service = createServiceClient();
  const result = await service.rpc("undo_ai_change_set", {
    target_change_set_id: parsed.changeSetId,
    target_actor_id: user.id,
    target_idempotency_key: parsed.idempotencyKey,
    target_update_data: bytesToPostgresBytea(update),
    target_expected_sequence: current.lastSequence,
    target_conflicts: undo.conflicts as Json,
  });
  const transaction = result.data?.[0];
  if (result.error || !transaction) {
    const message = result.error?.message ?? "AI change could not be undone.";
    if (result.error?.code === "40001" || result.error?.code === "23505") {
      throw new AiTransactionConflictError(message);
    }
    throw new AiTransactionAccessError(message);
  }
  if (update.length && transaction.created && transaction.result_sequence) {
    await broadcastAiCanvasUpdate({
      canvasId,
      sequence: transaction.result_sequence,
      update,
    });
  }
  return {
    changeSetId: transaction.change_set_id,
    created: transaction.created,
    conflicts: undo.conflicts,
  };
}
