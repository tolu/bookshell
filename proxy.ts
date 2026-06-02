import { NextResponse, type NextRequest } from "next/server";

// Gates the generation pipeline behind a shared password so that anyone with
// the deployed URL can't burn through Gemini credits. Only matters if
// GENERATE_PASSWORD is set in the environment — if it isn't, the gate is
// disabled so `next dev` works locally without configuration.
//
// Threat model: stop random visitors from using a paid feature. Not designed
// to withstand a determined attacker — the cookie value IS the password (so
// rotating the env invalidates all sessions). For more than this, swap in a
// real auth provider.

export const COOKIE_NAME = "bookshell_unlock";

// Edge runtime doesn't expose crypto.timingSafeEqual, so we implement a
// constant-time compare inline. Length difference is an acceptable leak
// here — the password length isn't sensitive.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Don't gate the unlock page itself — would create a redirect loop.
  if (pathname === "/generate/unlock") return NextResponse.next();

  const expected = process.env.GENERATE_PASSWORD;
  // No password configured → gate is off (local dev convenience). Set the
  // env on Vercel to enable.
  if (!expected) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && safeEqual(cookie, expected)) return NextResponse.next();

  // For the API endpoints, return 401 JSON instead of redirecting — fetch()
  // callers expect a status code, not an HTML login page.
  if (pathname.startsWith("/api/")) {
    return new NextResponse(
      JSON.stringify({ error: "Unauthorized — unlock at /generate/unlock" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/generate/unlock";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/generate/:path*",
    "/api/generate",
    "/api/save-artifact",
  ],
};
