import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* cacheComponents blanks /editor: EditorProvider uses Math.random for IDs. */
  cacheComponents: false,
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
