import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // No ignoreBuildErrors / ignoreEslintErrors: the build MUST pass legitimately.
  // Any TypeScript error is a real defect and must be fixed at the source.
  reactStrictMode: false,
};

export default nextConfig;
