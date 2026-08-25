import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binaere pakker maa ikke bundles af Next — de indlaeses fra node_modules
  // paa runtime. @napi-rs/canvas har praekompilerede binaerfiler, pg er en native driver.
  serverExternalPackages: ["@napi-rs/canvas", "pg"],

  // BEMAERK: saet IKKE output: "standalone" uden samtidig at tilfoeje
  // outputFileTracingIncludes for "./assets/**" — skabelonbilleder og fonte
  // laeses fra disk via process.cwd() og forsvinder ellers ved deploy.
};

export default nextConfig;
