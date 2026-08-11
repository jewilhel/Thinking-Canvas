"use client";

import { createBrowserClient } from "@supabase/ssr";

import { parsePublicEnvironment } from "@/lib/env";

export function createClient() {
  const environment = parsePublicEnvironment(process.env);

  return createBrowserClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
