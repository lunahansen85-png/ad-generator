import type { NextRequest } from "next/server";

/**
 * Den offentlige adresse appen er naaet paa.
 *
 * req.nextUrl.origin duer IKKE bag Railways proxy — den giver
 * http://localhost:8080 (containerens egen bind-adresse), og saa ville
 * CSV-eksporten pege paa localhost i stedet for det rigtige domaene.
 *
 * Raekkefoelge: eksplicit PUBLIC_BASE_URL -> Railways domaene ->
 * proxy-headere -> som sidste udvej request-origin.
 */
export function publicOrigin(req: NextRequest): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }

  return req.nextUrl.origin;
}
