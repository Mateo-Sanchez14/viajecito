import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/shared/i18n/request.ts");

// Serwist builds the service worker with webpack (`next build --webpack`); it is disabled in dev.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
  // The offline fallback page is not linked from anywhere, so precache it explicitly.
  additionalPrecacheEntries: [{ url: "/~offline", revision: crypto.randomUUID() }],
});

const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Icons come from one barrel (src/ui/icons.ts); keep the bundle to the icons actually used.
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  // Dev convenience only. Production relies on the tunnel splitting /api/* to the api,
  // so the rewrite (baked at build time) is not registered there.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalUrl}/api/:path*`,
      },
    ];
  },
};

export default withSerwist(withNextIntl(nextConfig));
