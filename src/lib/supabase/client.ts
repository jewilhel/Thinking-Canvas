"use client";

import { createBrowserClient } from "@supabase/ssr";

import { parsePublicEnvironment } from "@/lib/env";

export function createClient(
  input?: Parameters<typeof parsePublicEnvironment>[0],
) {
  const environment = parsePublicEnvironment(
    input ?? {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
  );

  return createBrowserClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
