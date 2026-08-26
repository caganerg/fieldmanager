import { NextRequest, NextResponse } from "next/server";

import { dataFileLocation, readDocument, saveData } from "@/lib/server/data-store";

// Reads and writes the file on every request, so it must never be prerendered
// or cached.
export const dynamic = "force-dynamic";

/**
 * The app has no authentication — see the security note in README.md. Anyone
 * who can reach this server can read and replace the stored field data, so the
 * app belongs on a trusted network or behind an authenticating reverse proxy.
 * The limits below are damage control, not access control: they stop a runaway
 * client or a careless script from filling the disk.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_WRITES = 60;
const writeCounts = new Map<string, { count: number; windowStart: number }>();

function getClientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = writeCounts.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    writeCounts.set(key, { count: 1, windowStart: now });
    if (writeCounts.size > 5000) {
      for (const [mapKey, mapEntry] of writeCounts) {
        if (now - mapEntry.windowStart > RATE_LIMIT_WINDOW_MS) writeCounts.delete(mapKey);
      }
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_WRITES;
}

function failure(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  console.error("Field data store failure:", message);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
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
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json(
      { error: "Too many writes. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const payload = body as { revision?: unknown; data?: unknown } | null;
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
