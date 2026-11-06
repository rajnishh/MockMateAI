import type { NextConfig } from "next";

// Hosts that reach the dev server through a tunnel (quick tunnels and PUBLIC_ORIGINS).
const tunnelHosts = (process.env.PUBLIC_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .flatMap((s) => {
    try {
      return [new URL(s).hostname];
    } catch {
      return [];
    }
  });

const nextConfig: NextConfig = {
  // Server-only packages with native code or workers that must not be bundled.
  serverExternalPackages: ["bullmq", "ioredis", "@napi-rs/canvas", "@contentauth/c2pa-node", "@apple/app-store-server-library"],
  allowedDevOrigins: ["*.trycloudflare.com", ...tunnelHosts],
  // The connector's consent screen must never be framed (clickjacking an Allow click).
  async headers() {
    return [{ source: "/oauth/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }];
  },
};

export default nextConfig;
