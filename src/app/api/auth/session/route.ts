import { NextRequest, NextResponse } from "next/server";

import { ensureReady } from "@/lib/server/auth-store";
import {
  accountFromRequest,
  clearSessionCookie,
  destroyCurrentSession,
  sessionUser,
} from "@/lib/server/session";

// Reads the account file on every request; never prerender or cache it.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Who this browser is. A visitor with no cookie is not an error — it is the
 * guest state the app opens in — so this answers `{ user: null }` with a 200
 * rather than a 401 the client would have to special-case.
 */
export async function GET(request: NextRequest) {
  // Makes sure a fresh installation has an administrator, and that a workspace
  // upgraded from the old team list has its people, before anybody tries to
  // sign in; the very first page load is what creates the account file.
  await ensureReady();
  const account = await accountFromRequest(request);
  return NextResponse.json(
    { user: account ? sessionUser(account) : null },
    { headers: NO_STORE }
  );
}

/** Signs out: the session record goes, and so does the cookie. */
export async function DELETE(request: NextRequest) {
  await destroyCurrentSession(request);
  return clearSessionCookie(
    NextResponse.json({ user: null }, { headers: NO_STORE }),
    request
  );
}
