import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ad-generator-auth";

// Internt vaerktoej: noindex paa alle svar herfra ogsaa. headers() i next.config.ts daekker de
// ruter, Next selv serverer; her daekkes login-omdirigeringen og NextResponse.next(). Se app/robots.ts.
const noindex = (res: NextResponse) => {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
};

export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;

  // No password configured (e.g. local dev) — let everything through.
  if (!password) return noindex(NextResponse.next());

  const p = req.nextUrl.pathname;
  if (p === "/login" || p === "/api/login" || p.startsWith("/i/") || p.startsWith("/v/")) {
    return noindex(NextResponse.next());
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie === password) return noindex(NextResponse.next());

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return noindex(NextResponse.redirect(loginUrl));
}

export const config = {
  // "i" = den offentlige billed-rute (/i/<noegle>). Den SKAL vaere undtaget:
  // Ad Studio og Meta henter billeder derfra uden login.
  // "v" = den offentlige video-rute (/v/<noegle>, kun noegler under vid/) — undtaget af samme grund:
  // Meta henter videoen derfra uden login.
  // robots.txt er undtaget, saa crawlere kan laese den (ellers 307 til /login).
  matcher: ["/((?!login|api/login|i/|v/|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
