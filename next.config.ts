import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Yjs performs singleton constructor checks. Keep one native server copy
  // shared by Server Components and Route Handlers while the browser bundle
  // remains independent.
  serverExternalPackages: ["yjs"],
};

export default nextConfig;
