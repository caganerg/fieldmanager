import { NextRequest, NextResponse } from "next/server";

import {
  ALL_FIELDS,
  isAccountRole,
  isAccountStatus,
  normalizeUsername,
  validatePassword,
  validateUsername,
  type AccountRole,
  type AccountStatus,
} from "@/lib/auth";
import { deleteAccount, updateAccount, type UpdateAccountInput } from "@/lib/server/auth-store";
import { requireAccount, requireAdmin, storeFailure } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type Context = { params: Promise<{ id: string }> };

/**
 * Editing a person.
 *
 * Anybody signed in may keep their own profile up to date — name, email, phone,
 * whether they are out in a field today. Everything that decides what somebody
 * may do — the role, the field assignment, the login itself — is an
 * administrator's to change, including on their own record.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireAccount(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;

  const isAdmin = auth.account.role === "admin";
  const isSelf = auth.account.id === id;
  if (!isAdmin && !isSelf) {
    return NextResponse.json(
      { error: "Only an administrator can edit somebody else." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const source = body as Record<string, unknown> | null;
  const update: UpdateAccountInput = {};

  if (typeof source?.name === "string") {
    const name = source.name.trim();
    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
    update.name = name;
  }
  if (typeof source?.email === "string") update.email = source.email;
  if (typeof source?.phone === "string") update.phone = source.phone;
  if (source?.status !== undefined) {
    if (!isAccountStatus(source.status)) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }
    update.status = source.status as AccountStatus;
  }

  const privileged =
    source?.role !== undefined ||
    source?.assignedFieldIds !== undefined ||
    source?.username !== undefined ||
    source?.password !== undefined;
  if (privileged && !isAdmin) {
    return NextResponse.json(
      { error: "Only an administrator can change roles, field access or sign-in details." },
      { status: 403 }
    );
  }

  if (source?.role !== undefined) {
    if (!isAccountRole(source.role)) {
      return NextResponse.json({ error: "Unknown role." }, { status: 400 });
    }
    if (isSelf && source.role !== "admin") {
      // Letting an admin demote themselves is how an installation loses its
      // last administrator by accident.
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 409 });
    }
    update.role = source.role as AccountRole;
  }

  if (source?.assignedFieldIds !== undefined) {
    update.assignedFieldIds = Array.isArray(source.assignedFieldIds)
      ? source.assignedFieldIds.filter((value): value is string => typeof value === "string")
      : [ALL_FIELDS];
  }

  if (source?.username !== undefined) {
    const username = normalizeUsername(source.username);
    if (username) {
      const invalid = validateUsername(username);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    } else if (isSelf) {
      return NextResponse.json(
        { error: "You cannot take away your own sign-in." },
        { status: 409 }
      );
    }
    update.username = username;
  }

  if (source?.password !== undefined && source.password !== "") {
    const password = typeof source.password === "string" ? source.password : "";
    const invalid = validatePassword(password);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    if (isSelf) {
      // Your own password goes through /api/auth/password, which asks for the
      // current one first.
      return NextResponse.json(
        { error: "Change your own password from your profile." },
        { status: 409 }
      );
    }
    update.password = password;
  }

  try {
    const result = await updateAccount(id, update);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ account: result.value }, { headers: NO_STORE });
  } catch (error) {
    return storeFailure(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;

  if (id === auth.account.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 409 });
  }

  try {
    const result = await deleteAccount(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return storeFailure(error);
  }
}
