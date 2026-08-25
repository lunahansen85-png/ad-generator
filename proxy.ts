import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ad-generator-auth";

export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;

  // No password configured (e.g. local dev) — let everything through.
  if (!password) return NextResponse.next();

  const p = req.nextUrl.pathname;
  if (p === "/login" || p === "/api/login" || p.startsWith("/i/")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie === password) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // "i" = den offentlige billed-rute (/i/<noegle>). Den SKAL vaere undtaget:
  // Ad Studio og Meta henter billeder derfra uden login.
  matcher: ["/((?!login|api/login|i/|_next/static|_next/image|favicon.ico).*)"],
};
