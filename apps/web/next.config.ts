import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true
  },
  transpilePackages: ["@retro/shared", "@retro/game-engine", "@retro/ai-core"]
};

export default nextConfig;
