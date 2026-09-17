import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@cutline/shared"],
  poweredByHeader: false,
};

export default config;
