import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@libsql/isomorphic-ws/web.mjs",
      "./node_modules/@libsql/isomorphic-ws/web.cjs",
    ],
  },
};
export default nextConfig;
