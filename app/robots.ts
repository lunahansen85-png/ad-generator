import type { MetadataRoute } from "next";

// Internt vaerktoej: holdes ude af soegeresultater med headeren X-Robots-Tag: noindex
// (sat i next.config.ts og proxy.ts). Crawling spaerres med vilje IKKE her — Googles dok:
// noindex virker kun paa sider, der ikke er blokeret i robots.txt; spaerrer man, ser Google
// aldrig headeren. Filen er undtaget i proxy.ts, saa den ikke sendes til /login.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
