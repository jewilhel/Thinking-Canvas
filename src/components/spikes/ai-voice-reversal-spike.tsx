"use client";

import { useEffect, useRef, useState } from "react";

import {
  reverseAiObjectChange,
  type AiObjectChangeRecord,
} from "@/ai/reversal";
import { Button } from "@/components/ui/button";
import type { CanvasObject } from "@/domain/canvas-object";
import {
  connectRealtimeVoice,
  type RealtimeConnection,
} from "@/voice/realtime-webrtc";

type Props = { canvasId: string; userId: string };

export function AiVoiceReversalSpike({ canvasId, userId }: Props) {
  const initialTime = "2026-08-11T16:00:00.000Z";
  const initialObject: CanvasObject = {
    schemaVersion: 1,
    id: "55555555-5555-4555-8555-555555555555",
    canvasId,
    createdBy: userId,
    createdAt: initialTime,
    updatedAt: initialTime,
    type: "text",
    text: "A rough idea about making group decisions visible.",
    geometry: { x: 80, y: 80, width: 320, height: 96, rotation: 0 },
  };
  const [object, setObject] = useState<CanvasObject>(initialObject);
  const [change, setChange] = useState<AiObjectChangeRecord | null>(null);
  const [instruction, setInstruction] = useState(
    "Rewrite this as a concise product insight.",
  );
  const [aiStatus, setAiStatus] = useState(
    "Ready to test the authenticated Responses route.",
  );
  const [voiceStatus, setVoiceStatus] = useState("DISCONNECTED");
  const voiceRef = useRef<RealtimeConnection | null>(null);

  useEffect(
    () => () => {
      voiceRef.current?.disconnect();
    },
    [],
  );

  function recordAiChange(before: CanvasObject, after: CanvasObject) {
    setObject(after);
    setChange({
      objectId: before.id,
      before,
      after,
      affectedFields: ["text"],
      explanation: "Rewrote the selected thought.",
    });
  }

  async function runAiCommand() {
    setAiStatus("Requesting one validated AI canvas command…");
    const response = await fetch("/api/spikes/ai/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canvasId, instruction, objects: [object] }),
    });
    const body = (await response.json()) as {
      error?: string;
      before?: CanvasObject;
      after?: CanvasObject;
      requestId?: string | null;
    };

    if (!response.ok || !body.before || !body.after) {
      setAiStatus(body.error ?? "The AI command did not complete.");
      return;
    }

    recordAiChange(body.before, body.after);
    setAiStatus(
      `Validated AI update staged${body.requestId ? ` (${body.requestId})` : ""}.`,
    );
  }

  function stageDeterministicChange() {
    if (!("text" in object)) return;
    const after: CanvasObject = {
      ...object,
      text: "Shared decisions become clearer when the reasoning stays visible.",
      updatedAt: new Date().toISOString(),
    };
    recordAiChange(object, after);
    setAiStatus("Deterministic AI fixture staged with a before/after record.");
  }

  function applyLaterHumanMove() {
    setObject((current) => ({
      ...current,
      geometry: { ...current.geometry, x: 620, y: 280 },
      updatedAt: new Date().toISOString(),
    }));
    setAiStatus("Later human move applied; the AI-authored text is unchanged.");
  }

  function reverseChange() {
    if (!change) return;
    const result = reverseAiObjectChange(change, object);
    setObject(result.object);
    setAiStatus(
      result.status === "conflict"
        ? "Reversal stopped: a later human edit changed the same field."
        : `AI text reversed; later unrelated edits preserved (${result.status}).`,
    );
  }

  async function connectVoice() {
    setVoiceStatus("CONNECTING");
    try {
      const connection = await connectRealtimeVoice(canvasId, (event) => {
        if (
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "session.created"
        ) {
          setVoiceStatus("CONNECTED");
        }
      });
      voiceRef.current = connection;
      setVoiceStatus(`CONNECTED · ${connection.model}`);
    } catch (error) {
      setVoiceStatus(error instanceof Error ? error.message : "VOICE ERROR");
    }
  }

  function disconnectVoice() {
    voiceRef.current?.disconnect();
    voiceRef.current = null;
    setVoiceStatus("DISCONNECTED");
  }

  return (
    <section
      className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
      aria-labelledby="ai-voice-spike-title"
    >
      <p className="text-xs font-semibold tracking-wider text-violet-300 uppercase">
        Slice 5 feasibility evidence
      </p>
      <h2 id="ai-voice-spike-title" className="mt-2 text-2xl font-semibold">
        AI, voice, and precise reversal
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
        The AI route receives a bounded canvas projection, validates one strict
        tool call, and passes it through the shared command boundary. Realtime
        voice uses a short-lived browser credential, while reversal restores
        only AI-authored fields that have not since changed.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl bg-zinc-950 p-4">
          <label htmlFor="ai-instruction" className="text-sm text-zinc-300">
            AI instruction
          </label>
          <textarea
            id="ai-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            className="mt-2 min-h-24 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void runAiCommand()}>
              Run authenticated AI command
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={stageDeterministicChange}
            >
              Stage test AI edit
            </Button>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-950 p-4">
          <p className="text-sm text-zinc-300">Realtime voice</p>
          <p className="mt-2 font-mono text-xs text-zinc-400" role="status">
            {voiceStatus}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void connectVoice()}
              disabled={voiceStatus.startsWith("CONNECT")}
            >
              Connect microphone
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={disconnectVoice}
              disabled={!voiceStatus.startsWith("CONNECTED")}
            >
              End voice session
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Microphone permission is requested only after you choose Connect.
            The standard OpenAI API key never enters this page.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-zinc-800 p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Current text</dt>
            <dd className="mt-1" data-testid="reversal-text">
              {"text" in object ? object.text : object.type}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Position</dt>
            <dd className="mt-1" data-testid="reversal-position">
              {object.geometry.x}, {object.geometry.y}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Recorded AI fields</dt>
            <dd className="mt-1">
              {change?.affectedFields.join(", ") ?? "none"}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={applyLaterHumanMove}>
            Apply later human move
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={reverseChange}
            disabled={!change}
          >
            Reverse recorded AI fields
          </Button>
        </div>
        <p
          className="mt-4 text-sm text-zinc-300"
          role="status"
          data-testid="ai-status"
        >
          {aiStatus}
        </p>
      </div>
    </section>
  );
}
