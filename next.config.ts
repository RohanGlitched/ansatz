import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: path.join(import.meta.dirname),
  // ffmpeg-static resolves its binary next to its own module; bundling it breaks that path
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/run": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/health": ["./node_modules/ffmpeg-static/ffmpeg*", "./data/showcase/**"],
    "/x/[id]": ["./data/showcase/**"],
    "/x/[id]/report": ["./data/showcase/**"],
    "/proof": ["./data/bench/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      { source: "/showcase/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default config;
