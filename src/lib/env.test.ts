import { describe, expect, it } from "vitest";

import { parseServerEnvironment, parseServiceEnvironment } from "@/lib/env";

const validEnvironment = {
  APP_ENV: "local",
  SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  OPENAI_API_KEY: "openai-key",
};

describe("parseServerEnvironment", () => {
  it("accepts a complete local environment", () => {
    expect(parseServerEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("rejects a missing secret", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        OPENAI_API_KEY: undefined,
      }),
    ).toThrow();
  });

  it("keeps deployment contexts distinct", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        APP_ENV: "staging",
      }),
    ).toThrow();
  });

  it("loads only the server credential needed by the tool executor", () => {
    expect(parseServiceEnvironment(validEnvironment)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: validEnvironment.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: validEnvironment.SUPABASE_SERVICE_ROLE_KEY,
    });
  });
});
