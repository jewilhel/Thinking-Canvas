import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

/** Legacy authority enforcement fixtures remain testable without a product mode picker. */
export async function setAiAuthorityFixture(page: Page, authority: string) {
  const canvasId = new URL(page.url()).pathname.split("/").at(-1)!;
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const auth = await client.auth.signInWithPassword({
    email: "owner@thinking-canvas.local",
    password: "LocalPassword1!",
  });
  if (auth.error) throw auth.error;
  const access = await client.rpc("get_canvas_ai_access", {
    target_canvas_id: canvasId,
  });
  if (access.error) throw access.error;
  const result = await client.rpc("set_canvas_ai_settings", {
    target_canvas_id: canvasId,
    target_enabled: true,
    target_authority: authority,
    target_expected_version: access.data[0].version,
  });
  if (result.error) throw result.error;
  await client.auth.signOut();
}
