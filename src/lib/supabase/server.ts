import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { parsePublicEnvironment } from "@/lib/env";

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
