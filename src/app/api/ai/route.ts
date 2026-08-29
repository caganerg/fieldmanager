import { NextRequest, NextResponse } from "next/server";

import {
  isAiProvider,
  isAssistantTopic,
  isSendable,
  sanitizeMessages,
  MAX_QUESTION_CHARS,
  type AiProvider,
} from "@/lib/ai";
import { requireAccount } from "@/lib/server/session";

/**
 * The assistant endpoint.
 *
 * Everything except the vendor call is written: the session check, the limits,
 * the validation and the shape of both answers. What is missing is the adapter
 * that turns a validated `AssistantAsk` into an OpenAI, Gemini or Claude
 * request — see the marked section at the bottom.
 *
 * The key is read from the server environment and never leaves it, the same
 * rule the weather route follows. There is no settings field for it and the
 * route does not accept one from the request: a client that could name its own
 * endpoint or carry its own key is a client that can bill somebody else's
 * account and put the key in a URL.
 */

export const dynamic = "force-dynamic";

// A question is not a write, so any signed-in account may ask one — a viewer
// included. These limits are damage control on top of that: unlike the data
// route, where they guard the disk, here they guard the bill, one request at a
// time being the only thing standing between a loop in a component and a
// four-figure invoice.
const MAX_BODY_BYTES = 128 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ASKS = 20;
const askCounts = new Map<string, { count: number; windowStart: number }>();

function getClientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = askCounts.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    askCounts.set(key, { count: 1, windowStart: now });
    if (askCounts.size > 5000) {
      for (const [mapKey, mapEntry] of askCounts) {
        if (now - mapEntry.windowStart > RATE_LIMIT_WINDOW_MS) askCounts.delete(mapKey);
      }
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_ASKS;
}

interface ProviderConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

/**
 * Which vendor this installation talks to, if any.
 *
 * The model is configuration rather than a constant in the source because model
 * names are the fastest-moving part of all three APIs; a default compiled in
 * here would be wrong within months and would be wrong silently.
 */
function readProviderConfig(): ProviderConfig | null {
  const provider = (process.env.FIELDMANAGER_AI_PROVIDER || "").trim().toLowerCase();
  const apiKey = (process.env.FIELDMANAGER_AI_API_KEY || "").trim();
  const model = (process.env.FIELDMANAGER_AI_MODEL || "").trim();
  if (!isAiProvider(provider) || apiKey === "" || model === "") return null;
  return { provider, apiKey, model };
}

export async function POST(request: NextRequest) {
  const auth = await requireAccount(request);
  if ("response" in auth) return auth.response;

  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json(
      { error: "Too many questions in a row. Please wait a moment." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
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

  const payload = (body || {}) as Record<string, unknown>;
  if (!isAssistantTopic(payload.topic)) {
    return NextResponse.json({ error: "Unknown assistant topic." }, { status: 400 });
  }

  const messages = sanitizeMessages(payload.messages);
  if (!isSendable(messages)) {
    return NextResponse.json(
      { error: `A question is required, and it must be at most ${MAX_QUESTION_CHARS} characters.` },
      { status: 400 }
    );
  }

  const config = readProviderConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "The assistant is not configured on this server. Set FIELDMANAGER_AI_PROVIDER, FIELDMANAGER_AI_API_KEY and FIELDMANAGER_AI_MODEL in .env.local.",
        unconfigured: true,
      },
      { status: 503 }
    );
  }

  // ---------------------------------------------------------------------
  // The adapter goes here.
  //
  // The request is valid and the provider is configured by this point, so what
  // is left is one function per vendor with the same signature: take the topic,
  // the field id and `messages`, build the system prompt from the stored
  // document (`readDocument()` in `@/lib/server/data-store`), call the vendor,
  // and return `{ reply, provider, model }`. The differences to absorb are the
  // ones `@/lib/ai` documents — where the system prompt goes, what the second
  // role is called, and where the text sits in the response.
  //
  // Nothing above this line should need to change to add the third vendor.
  // ---------------------------------------------------------------------
  return NextResponse.json(
    { error: "The assistant back end is not implemented yet." },
    { status: 501 }
  );
}
