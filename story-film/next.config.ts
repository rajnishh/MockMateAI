import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BullMQ and ioredis are server-only and must not be bundled.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
