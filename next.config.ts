import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  // Always emit standalone output so Docker / Zeabur image runs with node server.js.
  output: "standalone",
};

export default nextConfig;
