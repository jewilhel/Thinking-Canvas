import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { parsePublicEnvironment, parseServiceEnvironment } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export async function createClient() {
  const environment = parsePublicEnvironment(process.env);
  const cookieStore = await cookies();

  return createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write response cookies. The root proxy
            // performs refresh writes before protected routes render.
          }
        },
      },
    },
  );
}

export function createServiceClient() {
  const environment = parseServiceEnvironment(process.env);
  return createSupabaseClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
