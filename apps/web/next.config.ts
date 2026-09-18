import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@cutline/shared"],
  poweredByHeader: false,
  experimental: {
    optimizeCss: true,
  },
};

export default config;
