import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binaere pakker maa ikke bundles af Next — de indlaeses fra node_modules
  // paa runtime. @napi-rs/canvas har praekompilerede binaerfiler, pg er en native driver.
  serverExternalPackages: ["@napi-rs/canvas", "pg"],

  // BEMAERK: saet IKKE output: "standalone" uden samtidig at tilfoeje
  // outputFileTracingIncludes for "./assets/**" — skabelonbilleder og fonte
  // laeses fra disk via process.cwd() og forsvinder ellers ved deploy.

  // Internt vaerktoej — maa ALDRIG dukke op i soegeresultater. X-Robots-Tag: noindex paa ALLE svar,
  // ogsaa /login (det eneste en soegemaskine nogensinde ser) og de offentlige billeder paa /i/*.
  // Googles dok: siden droppes helt fra resultaterne, uanset om andre linker til den — men KUN hvis
  // siden ikke er spaerret i robots.txt (se app/robots.ts). Headeren styrer alene soegemaskiners
  // indeksering; Metas og Ad Studios billed-hentning fra /i/* paavirkes ikke.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
