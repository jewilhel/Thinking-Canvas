"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";

import {
  createCanvas,
  type CreateCanvasState,
} from "@/app/(protected)/app/actions";
import { Button } from "@/components/ui/button";

const initialCreateCanvasState: CreateCanvasState = { message: "" };

export function CreateCanvasForm() {
  const [state, formAction, pending] = useActionState(
    createCanvas,
    initialCreateCanvasState,
  );
  const titleError = state.fieldErrors?.title?.at(0);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="canvas-title" className="text-sm font-medium">
            Canvas name
          </label>
          <input
            id="canvas-title"
            name="title"
            type="text"
            required
            maxLength={500}
            autoComplete="off"
            aria-describedby={
              state.message ? "create-canvas-message" : undefined
            }
            aria-invalid={Boolean(titleError)}
            placeholder="Quarterly planning"
            className="mt-2 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none"
          />
        </div>
        <Button type="submit" disabled={pending} className="sm:min-w-36">
          <Plus aria-hidden="true" />
          {pending ? "Creating…" : "Create canvas"}
        </Button>
      </div>
      <p
        id="create-canvas-message"
        role="status"
        aria-live="polite"
        className="mt-3 min-h-5 text-sm text-amber-300"
      >
        {titleError ?? state.message}
      </p>
    </form>
  );
}
