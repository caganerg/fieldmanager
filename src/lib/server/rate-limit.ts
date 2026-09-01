import { NextResponse, type NextRequest } from "next/server";

/**
 * The per-client limits the API routes share.
 *
 * Four routes wanted the same counter with different numbers on it — the
 * weather proxy guarding a shared OpenWeather quota, the data route guarding
 * the disk, the assistant guarding the bill, and sign-in guarding a slow
 * password hash — and each carried its own copy of it. One implementation
 * means the window, the sweep and the client-address rule cannot drift apart,
 * and the four sets of numbers are visible where they are declared.
 *
 * None of this is access control; that is the session check each route makes
 * first. In-memory state is the right fit here because the app is deployed as
 * a single long-running process (see README), not spread across serverless
 * instances that would each keep their own count.
 */

/** The address a limit is counted against. */
export function clientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// Above this many tracked addresses, a new window sweeps the expired ones out.
// It keeps the map from growing for the life of the process when many distinct
// clients — or spoofed ones — show up.
const SWEEP_THRESHOLD = 5000;

export interface RateLimiter {
  /** True when this key has already used up the window. Counts the call. */
  isLimited(key: string): boolean;
  /** Forgets a key, so a success can wipe the failures that came before it. */
  clear(key: string): void;
}

export function createRateLimiter({
  windowMs,
  max,
}: {
  windowMs: number;
  max: number;
}): RateLimiter {
  const counts = new Map<string, { count: number; windowStart: number }>();

  return {
    isLimited(key) {
      const now = Date.now();
      const entry = counts.get(key);

      if (!entry || now - entry.windowStart > windowMs) {
        counts.set(key, { count: 1, windowStart: now });
        if (counts.size > SWEEP_THRESHOLD) {
          for (const [mapKey, mapEntry] of counts) {
            if (now - mapEntry.windowStart > windowMs) counts.delete(mapKey);
          }
        }
        return false;
      }

      entry.count += 1;
      return entry.count > max;
    },

    clear(key) {
      counts.delete(key);
    },
  };
}

/** The 429 every limited route answers with; the wording is the caller's. */
export function tooManyRequests(message: string, retryAfterSeconds: number) {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

/**
 * Reads a JSON body, refusing one that is too big.
 *
 * The declared length is checked first so an oversized upload is turned away
 * before it is read, and the text is checked again afterwards because
 * `content-length` is the client's claim, not a fact.
 *
 * Returns either the parsed value or the response to send, the same shape the
 * session helpers use, so a handler stays a pair of early returns.
 */
export async function readJsonBody(
  request: NextRequest,
  maxBytes: number
): Promise<{ body: unknown } | { response: NextResponse }> {
  const tooLarge = () => ({
    response: NextResponse.json({ error: "Payload too large." }, { status: 413 }),
  });

  if (Number(request.headers.get("content-length") || 0) > maxBytes) return tooLarge();

  try {
    const raw = await request.text();
    if (raw.length > maxBytes) return tooLarge();
    return { body: JSON.parse(raw) };
  } catch {
    return {
      response: NextResponse.json(
        { error: "Request body is not valid JSON." },
        { status: 400 }
      ),
    };
  }
}
