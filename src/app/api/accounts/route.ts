import { NextRequest, NextResponse } from "next/server";

import {
  ALL_FIELDS,
  isAccountRole,
  normalizeUsername,
  validatePassword,
  validateUsername,
  type AccountRole,
} from "@/lib/auth";
import { createAccount, listAccounts } from "@/lib/server/auth-store";
import { requireAccount, requireAdmin, storeFailure } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * The people in this workspace: the team panel on the map and the Users page
 * are two views of this one list.
 *
 * Any signed-in account may read it — a directory nobody can see is not a
 * directory. Administrators get the fuller record (last sign-in, whether the
 * password is still one somebody else chose); see `toPublicAccount`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAccount(request);
  if ("response" in auth) return auth.response;
  try {
    const accounts = await listAccounts(auth.account.role === "admin");
    return NextResponse.json({ accounts }, { headers: NO_STORE });
  } catch (error) {
    return storeFailure(error);
  }
}

function readAssignedFields(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [ALL_FIELDS];
  return value.filter((id): id is string => typeof id === "string");
}

/**
 * Adds a person. A username and a password are optional and go together: leave
 * them out for somebody who belongs in the directory but has no reason to sign
 * in yet, and grant the login later from the same form.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const source = body as Record<string, unknown> | null;
  const name = typeof source?.name === "string" ? source.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

  if (!isAccountRole(source?.role)) {
    return NextResponse.json({ error: "Pick a role for this person." }, { status: 400 });
  }

  const username = normalizeUsername(source?.username);
  const password = typeof source?.password === "string" ? source.password : "";
  if (username || password) {
    const usernameError = validateUsername(username);
    if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
    const passwordError = validatePassword(password);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  try {
    const result = await createAccount({
      name,
      email: typeof source?.email === "string" ? source.email : "",
      phone: typeof source?.phone === "string" ? source.phone : "",
      role: source.role as AccountRole,
      assignedFieldIds: readAssignedFields(source?.assignedFieldIds),
      username,
      password,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ account: result.value }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return storeFailure(error);
  }
}
