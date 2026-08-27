import { NextRequest, NextResponse } from "next/server";

import { validatePassword } from "@/lib/auth";
import { changeOwnPassword, sessionTokenHash } from "@/lib/server/auth-store";
import { requireAccount, sessionTokenFromRequest, sessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Changes the signed-in account's own password. Resetting somebody else's is a
 * different thing with different rules, and lives in `/api/accounts/[id]`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAccount(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const source = body as { currentPassword?: unknown; newPassword?: unknown } | null;
  const currentPassword =
    typeof source?.currentPassword === "string" ? source.currentPassword : "";
  const newPassword = typeof source?.newPassword === "string" ? source.newPassword : "";

  const invalid = validatePassword(newPassword);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "The new password must be different from the current one." },
      { status: 400 }
    );
  }

  const token = sessionTokenFromRequest(request);
  const result = await changeOwnPassword(
    auth.account.id,
    currentPassword,
    newPassword,
    token ? sessionTokenHash(token) : null
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { user: sessionUser(result.value) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
