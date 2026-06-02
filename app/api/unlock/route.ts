import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/proxy";

export const runtime = "nodejs";

type Body = { password?: string; next?: string };

// Same constant-time compare as the middleware. Kept in-file so the route is
// self-contained; could be hoisted to a shared util later.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Only allow same-origin redirect paths so an attacker can't construct a
// link like /generate/unlock?next=https://evil.com that redirects you after
// a legitimate unlock.
function sanitizeNext(raw: string | undefined): string {
  if (!raw) return "/generate";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/generate";
  return raw;
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expected = process.env.GENERATE_PASSWORD;
  if (!expected) {
    // No password configured → there's nothing to unlock. Tell the client so
    // it can just navigate to /generate.
    return NextResponse.json({
      ok: true,
      redirectTo: sanitizeNext(body.next),
      note: "GENERATE_PASSWORD not set; gate is disabled",
    });
  }

  const password = (body.password ?? "").trim();
  if (!password || !safeEqual(password, expected)) {
    // Generic message — don't reveal whether the password was empty, too
    // short, etc.
    return NextResponse.json({ error: "Feil passord" }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    redirectTo: sanitizeNext(body.next),
  });
  res.cookies.set({
    name: COOKIE_NAME,
    value: expected,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // 30 days. Re-entry is mild friction, not catastrophe.
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
