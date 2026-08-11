"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const createCanvasSchema = z.object({
  title: z.string().trim().min(1).max(500),
});

export type CreateCanvasState = {
  message: string;
  fieldErrors?: { title?: string[] };
};

export async function createCanvas(
  _previousState: CreateCanvasState,
  formData: FormData,
): Promise<CreateCanvasState> {
  const user = await requireAuthenticatedUser();
  const input = createCanvasSchema.safeParse({ title: formData.get("title") });

  if (!input.success) {
    return {
      message: "Enter a canvas name between 1 and 500 characters.",
      fieldErrors: input.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const canvasId = crypto.randomUUID();
  const { error } = await supabase.from("canvases").insert({
    id: canvasId,
    owner_id: user.id,
    title: input.data.title,
  });

  if (error) {
    return {
      message: "The canvas could not be created. Try again.",
    };
  }

  revalidatePath("/app");
  redirect(`/app/canvases/${canvasId}`);
}
