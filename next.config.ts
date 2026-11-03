import type { NextConfig } from "next";

/**
 * The desktop build is a static export that Electron serves off disk, while the
 * Docker image still runs `next start` out of .next — so the export only turns
 * on for `npm run electron:build`, and lands in its own directory. Every route
 * here prerenders already, and nothing uses a server feature export forbids.
 */
const desktop = process.env.DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  /* cacheComponents blanks /editor: EditorProvider uses Math.random for IDs. */
  cacheComponents: false,
  ...(desktop
    ? {
        output: "export" as const,
        /* In export mode this names the export folder, not .next. */
        distDir: "out-desktop",
        images: { unoptimized: true },
      }
    : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
