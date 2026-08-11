import { z } from "zod";

import {
  bytesToPostgresBytea,
  postgresByteaToBytes,
} from "@/collaboration/canvas-document";
import { buildCompactedSnapshot } from "@/collaboration/persistence";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.strictObject({ canvasId: z.uuid() });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "A valid canvas ID is required." },
      { status: 400 },
    );
  }

  const canvasId = parsed.data.canvasId;
  const [snapshotResult, updatesResult] = await Promise.all([
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

  if (snapshotResult.error || updatesResult.error) {
    return Response.json(
      { error: "Canvas state is not accessible." },
      { status: 403 },
    );
  }

  const snapshot = snapshotResult.data
    ? {
        version: snapshotResult.data.version,
        lastSequence: snapshotResult.data.last_sequence,
        state: postgresByteaToBytes(snapshotResult.data.state),
        stateHash: snapshotResult.data.state_hash,
      }
    : null;
  const updates = updatesResult.data.map((row) => ({
    sequence: row.sequence,
    update: postgresByteaToBytes(row.update_data),
  }));

  if (!snapshot && updates.length === 0) {
    return Response.json(
      { error: "There are no updates to compact." },
      { status: 409 },
    );
  }

  const compacted = await buildCompactedSnapshot(snapshot, updates);
  const { data, error } = await supabase.rpc("publish_canvas_compaction", {
    target_canvas_id: canvasId,
    covered_last_sequence: compacted.lastSequence,
    snapshot_state: bytesToPostgresBytea(compacted.state),
    expected_state_hash: compacted.stateHash,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 409 });
  }

  return Response.json(data.at(0));
}
