import { NextRequest, NextResponse } from "next/server";

import { normalizeUsername } from "@/lib/auth";
import { authenticate, createSession } from "@/lib/server/auth-store";
import { sessionUser, setSessionCookie, storeFailure } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Sign-in attempts are throttled per client address. Password checking is
 * deliberately slow (scrypt), so an unthrottled endpoint is both a guessing
 * oracle and a way to pin the CPU of a small server.
 */
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; windowStart: number }>();

function clientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    if (attempts.size > 5000) {
      for (const [mapKey, mapEntry] of attempts) {
        if (now - mapEntry.windowStart > WINDOW_MS) attempts.delete(mapKey);
      }
    }
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  if (tooManyAttempts(key)) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": "300" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const source = body as { username?: unknown; password?: unknown } | null;
  const username = normalizeUsername(source?.username);
  const password = typeof source?.password === "string" ? source.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  try {
    const account = await authenticate(username, password);
    if (!account) {
      // One message for both a wrong username and a wrong password, so the
      // reply never confirms that an account exists.
      return NextResponse.json(
        { error: "Username or password is not correct." },
        { status: 401 }
      );
    }

    attempts.delete(key);
    const session = await createSession(account.id);
    return setSessionCookie(
      NextResponse.json(
        { user: sessionUser(account) },
        { headers: { "Cache-Control": "no-store" } }
      ),
      request,
      session.token,
      session.expiresAt
    );
  } catch (error) {
    return storeFailure(error);
  }
}
