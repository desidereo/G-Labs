import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/investment-lab",
  serverExternalPackages: ["@libsql/client"],
  env: {
    NEXT_PUBLIC_BASE_PATH: "/investment-lab",
  },
};

export default nextConfig;
