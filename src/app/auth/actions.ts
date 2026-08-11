"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(8).max(128),
});

export async function signIn(formData: FormData) {
  const credentials = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!credentials.success) {
    redirect("/auth/sign-in?error=invalid-input");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials.data);

  if (error) {
    redirect("/auth/sign-in?error=invalid-credentials");
  }

  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in?reason=signed-out");
}
