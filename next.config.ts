import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic App Router semantics: public pages use `export const revalidate`
  // (timed revalidation) per the spec. Cache Components mode is deliberately off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["pg", "pg-boss", "exceljs", "@react-pdf/renderer"],
  async headers() {
    return [
      {
        // Embeds must be frameable by other sites.
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
