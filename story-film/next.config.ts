import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages with native code or workers that must not be bundled.
  serverExternalPackages: ["bullmq", "ioredis", "@napi-rs/canvas"],
};

export default nextConfig;
