import { NextRequest, NextResponse } from "next/server";

import { normalizeUsername } from "@/lib/auth";
import { authenticate, createSession } from "@/lib/server/auth-store";
import { clientKey, createRateLimiter, tooManyRequests } from "@/lib/server/rate-limit";
import { sessionUser, setSessionCookie, storeFailure } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Sign-in attempts are throttled per client address. Password checking is
 * deliberately slow (scrypt), so an unthrottled endpoint is both a guessing
 * oracle and a way to pin the CPU of a small server.
 */
const attempts = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  if (attempts.isLimited(key)) {
    return tooManyRequests("Too many sign-in attempts. Try again in a few minutes.", 300);
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

    attempts.clear(key);
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
