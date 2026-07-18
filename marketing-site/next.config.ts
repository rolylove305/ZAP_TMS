import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The marketing page is public and does not need server-side rendering.
  // Export it as static HTML so Cloudflare Pages can serve dist/client.
  output: "export",
};

export default nextConfig;
