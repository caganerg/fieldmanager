import { NextRequest, NextResponse } from "next/server";

import { roleCanEdit, toSessionUser, type PublicAccount, type SessionUser } from "@/lib/auth";
import { accountForToken, destroySession } from "@/lib/server/auth-store";

/**
 * Turning a request into the account that made it, and back into a cookie.
 *
 * The cookie holds a random token and nothing else — no claims, no signature to
 * get wrong. Everything about the session is looked up server-side, so removing
 * an account or resetting its password takes effect on the next request rather
 * than whenever a token happens to expire.
 */

export const SESSION_COOKIE = "fieldmanager_session";

export async function accountFromRequest(request: NextRequest): Promise<PublicAccount | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return accountForToken(token);
}

export function sessionTokenFromRequest(request: NextRequest): string {
  return request.cookies.get(SESSION_COOKIE)?.value || "";
}

/**
 * `secure` follows the scheme the browser actually used. Hard-coding it would
 * break the documented setup — a LAN install reached over plain http — and
 * leaving it off would weaken a proper https deployment.
 */
function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return request.nextUrl.protocol === "https:";
}

export function setSessionCookie(
  response: NextResponse,
  request: NextRequest,
  token: string,
  expires: Date
): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    expires,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse, request: NextRequest): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}

export const UNAUTHORIZED = { error: "Sign in to continue." };
export const FORBIDDEN = { error: "This account is not allowed to do that." };

export function unauthorized(): NextResponse {
  return NextResponse.json(UNAUTHORIZED, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}

export function forbidden(message = FORBIDDEN.error): NextResponse {
  return NextResponse.json({ error: message }, {
    status: 403,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Any signed-in account. */
export async function requireAccount(
  request: NextRequest
): Promise<{ account: PublicAccount } | { response: NextResponse }> {
  const account = await accountFromRequest(request);
  if (!account) return { response: unauthorized() };
  return { account };
}

/** A signed-in account that is allowed to change the workspace. */
export async function requireEditor(
  request: NextRequest
): Promise<{ account: PublicAccount } | { response: NextResponse }> {
  const result = await requireAccount(request);
  if ("response" in result) return result;
  if (!roleCanEdit(result.account.role)) {
    return { response: forbidden("This account has read-only access.") };
  }
  return result;
}

/** A signed-in administrator. */
export async function requireAdmin(
  request: NextRequest
): Promise<{ account: PublicAccount } | { response: NextResponse }> {
  const result = await requireAccount(request);
  if ("response" in result) return result;
  if (result.account.role !== "admin") {
    return { response: forbidden("Only an administrator can manage accounts.") };
  }
  return result;
}

export function sessionUser(account: PublicAccount): SessionUser {
  return toSessionUser(account);
}

/** Drops the session record this request's cookie points at, if any. */
export async function destroyCurrentSession(request: NextRequest): Promise<void> {
  const token = sessionTokenFromRequest(request);
  if (token) await destroySession(token);
}
