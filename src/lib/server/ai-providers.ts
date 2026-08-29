import Anthropic from "@anthropic-ai/sdk";

import type { AiMessage, AiProvider } from "@/lib/ai";

/**
 * One function per vendor, all with the same signature.
 *
 * `@/lib/ai` already reduced the conversation to what all three accept, so what
 * is left here is the three places they disagree: where the system prompt goes,
 * what the assistant role is called, and where the text sits in the response.
 * Nothing above this file needs to know which one answered.
 *
 * Claude goes through the official SDK; OpenAI and Gemini go over plain HTTP.
 * That asymmetry is deliberate rather than an oversight — writing the Anthropic
 * call by hand when a maintained SDK exists means reimplementing its retries
 * and typed errors, while installing two more SDKs to send one POST each would
 * cost more than it returns. Their REST shapes are stable and small.
 */

export interface AiCall {
  apiKey: string;
  model: string;
  system: string;
  messages: AiMessage[];
}

/** Thrown with a status the route can map, and never carrying the key. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

// A farm question answered into a chat bubble is a deliberately short output —
// the system prompt asks for a few sentences — so the ceiling is low on
// purpose. It is a cap, not a target: billing follows the tokens actually
// produced.
const MAX_ANSWER_TOKENS = 2048;

// Long enough for a thinking model on a real question, short enough that a
// wedged vendor does not hold a route handler open indefinitely.
const TIMEOUT_MS = 60_000;

function emptyAnswer(): never {
  throw new AiProviderError("The provider returned an empty answer.", 502);
}

async function callAnthropic({ apiKey, model, system, messages }: AiCall): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  try {
    // `thinking` is deliberately not set. The model is operator configuration,
    // so this code cannot know which family it is talking to, and the parameter
    // is rejected outright by some and required in an older shape by others.
    // Omitting it lets each model apply its own default — which on the current
    // ones is adaptive thinking anyway.
    const response = await client.messages.create({
      model,
      max_tokens: MAX_ANSWER_TOKENS,
      system,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
    });

    // `content` is a union of block types; only the text blocks are the answer.
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (response.stop_reason === "refusal") {
      throw new AiProviderError("The model declined to answer that question.", 422);
    }
    return text === "" ? emptyAnswer() : text;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    // Most specific first: an operator whose key is wrong needs a different
    // message from a farm that has simply asked too much this minute.
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiProviderError("The provider rejected the configured API key.", 502);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiProviderError("The provider is rate limiting this key.", 429);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AiProviderError(`The provider returned an error (${error.status}).`, 502);
    }
    throw new AiProviderError("Could not reach the provider.", 502);
  }
}

/**
 * Shared plumbing for the two HTTP vendors: the timeout, and turning a non-2xx
 * into the same error the SDK path produces. The response body is logged rather
 * than returned — it can quote the request, and the request holds the farm's
 * records.
 */
async function postJson(url: string, headers: Record<string, string>, body: unknown, label: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AiProviderError("Could not reach the provider.", 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`${label} request failed (${response.status}):`, detail.slice(0, 500));
    if (response.status === 401 || response.status === 403) {
      throw new AiProviderError("The provider rejected the configured API key.", 502);
    }
    if (response.status === 429) {
      throw new AiProviderError("The provider is rate limiting this key.", 429);
    }
    throw new AiProviderError(`The provider returned an error (${response.status}).`, 502);
  }

  return response.json().catch(() => {
    throw new AiProviderError("The provider returned a malformed response.", 502);
  });
}

async function callOpenAi({ apiKey, model, system, messages }: AiCall): Promise<string> {
  // OpenAI is the one of the three that takes the system prompt as a leading
  // message rather than its own parameter.
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ],
    // No token cap is sent on purpose: the field that carries one was renamed
    // between model generations, and the model here is operator configuration,
    // so either spelling risks a 400 on half of them. Brevity is asked for in
    // the system prompt instead.
  };

  const data = (await postJson(
    "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${apiKey}` },
    payload,
    "OpenAI"
  )) as { choices?: { message?: { content?: unknown } }[] };

  const text = data.choices?.[0]?.message?.content;
  return typeof text === "string" && text.trim() !== "" ? text.trim() : emptyAnswer();
}

async function callGemini({ apiKey, model, system, messages }: AiCall): Promise<string> {
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    // Gemini calls the assistant role "model"; this is the rename `@/lib/ai`
    // says belongs in the adapter.
    contents: messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
  };

  // The key goes in a header rather than the query string the Gemini docs
  // reach for first: a URL travels into proxy logs and error reports, which is
  // exactly how the weather key used to leak before it was moved server-side.
  const data = (await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": apiKey },
    payload,
    "Gemini"
  )) as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] };

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  return text === "" ? emptyAnswer() : text;
}

const ADAPTERS: Record<AiProvider, (call: AiCall) => Promise<string>> = {
  anthropic: callAnthropic,
  openai: callOpenAi,
  gemini: callGemini,
};

export function askProvider(provider: AiProvider, call: AiCall): Promise<string> {
  return ADAPTERS[provider](call);
}
