import { z } from "zod";

export const appEnvironmentSchema = z.enum(["local", "preview", "production"]);

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  APP_ENV: appEnvironmentSchema,
  SITE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
});

export const serviceEnvironmentSchema = publicEnvironmentSchema
  .pick({
    NEXT_PUBLIC_SUPABASE_URL: true,
  })
  .extend({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  });

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parsePublicEnvironment(
  environment: Record<string, string | undefined>,
): PublicEnvironment {
  return publicEnvironmentSchema.parse(environment);
}

export function parseServerEnvironment(
  environment: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(environment);
}

export function parseServiceEnvironment(
  environment: Record<string, string | undefined>,
) {
  return serviceEnvironmentSchema.parse(environment);
}
