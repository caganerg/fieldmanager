import { NextRequest, NextResponse } from "next/server";

import { dataFileLocation, readDocument, saveData } from "@/lib/server/data-store";
import {
  clientKey,
  createRateLimiter,
  readJsonBody,
  tooManyRequests,
} from "@/lib/server/rate-limit";
import { requireAccount, requireEditor } from "@/lib/server/session";

// Reads and writes the file on every request, so it must never be prerendered
// or cached.
export const dynamic = "force-dynamic";

/**
 * Every request here must carry a session cookie: a visitor who has not signed
 * in is a guest and sees none of this. Reading needs any account, writing needs
 * one whose role is not `viewer`.
 *
 * The limits below are not access control — that is the session check — but
 * damage control on top of it: they stop a runaway client or a careless script
 * from filling the disk.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });

function failure(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  console.error("Field data store failure:", message);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAccount(request);
  if ("response" in auth) return auth.response;

  try {
    const document = await readDocument();
    return NextResponse.json(document, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error, `Could not read the data file at ${dataFileLocation()}.`);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireEditor(request);
  if ("response" in auth) return auth.response;

  if (limiter.isLimited(clientKey(request))) {
    return tooManyRequests("Too many writes. Please slow down and try again shortly.", 60);
  }

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if ("response" in parsed) return parsed.response;

  const payload = parsed.body as { revision?: unknown; data?: unknown } | null;
  const revision = Number(payload?.revision);
  if (!payload || !Number.isFinite(revision) || revision < 0) {
    return NextResponse.json(
      { error: "A numeric `revision` and a `data` object are required." },
      { status: 400 }
    );
  }

  try {
    const result = await saveData(payload.data, Math.floor(revision));
    if (!result.ok) {
      // Somebody else wrote first. Hand back the current document so the client
      // can adopt it instead of overwriting work it never saw.
      return NextResponse.json(result.document, {
        status: 409,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(result.document, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error, `Could not write the data file at ${dataFileLocation()}.`);
  }
}
