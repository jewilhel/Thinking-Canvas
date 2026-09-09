import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Yjs performs singleton constructor checks. Keep one native server copy
  // shared by Server Components and Route Handlers while the browser bundle
  // remains independent.
  serverExternalPackages: ["yjs"],
  // Public build metadata only. Netlify's build context is not a function secret.
  env: {
    VOICE_DEPLOY_ENVIRONMENT: process.env.APP_ENV ?? "local",
    VOICE_DEPLOY_ORIGIN: process.env.DEPLOY_URL ?? "",
    VOICE_BUILD_REF: process.env.COMMIT_REF ?? "local",
  },
};

export default nextConfig;
