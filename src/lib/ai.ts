/**
 * The shape of a question put to the assistant, and of the answer that comes
 * back.
 *
 * This module is deliberately isomorphic in the same way `field-data.ts`,
 * `soil.ts` and `auth.ts` are: no `node:fs`, no vendor SDK, no key. The browser
 * builds a request against it, the route validates against it, and whichever
 * adapter ends up calling OpenAI, Gemini or Claude reads the same definition.
 *
 * Nothing here is vendor-specific on purpose. The three APIs disagree about
 * almost everything at the edges, and the parts they agree on are what this
 * file holds:
 *
 *   - A system prompt that travels *beside* the turns, not inside them.
 *     Anthropic takes `system` as its own parameter and Gemini takes
 *     `systemInstruction`; only OpenAI accepts it as a leading message. Keeping
 *     it separate converts to all three, and the reverse does not.
 *   - Turns that alternate user and assistant. Gemini calls the second role
 *     "model" and Anthropic calls it "assistant"; that rename belongs in the
 *     adapter, not in what the app passes around.
 *   - A first turn that is always the user's. Anthropic and Gemini both reject
 *     a conversation that opens with an assistant turn.
 *
 * The system prompt itself is assembled on the server, not here — see
 * `AssistantAsk` below for why.
 */

export const AI_PROVIDERS = ["anthropic", "openai", "gemini"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type AiRole = "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

/**
 * Which part of the app the question was asked from. It selects the system
 * prompt and decides what the route puts in front of the model — a soil
 * question wants the analyses, a fertilisation question wants those plus what
 * has already been applied, a crop protection question wants the treatments.
 */
export const ASSISTANT_TOPICS = ["general", "fertilizer", "soil", "protection"] as const;
export type AssistantTopic = (typeof ASSISTANT_TOPICS)[number];

// Ceilings, not expectations. A model call costs money per token, so unlike the
// data route — where the limits guard the disk — these guard the bill, and a
// runaway client is the thing they are guarding against.
export const MAX_QUESTION_CHARS = 2000;
export const MAX_TURNS = 40;

/**
 * What the browser posts to `/api/ai`.
 *
 * It carries no field data, only the id of the field the question is about.
 * The server already holds the document and can read the analyses and the
 * records itself, which is both cheaper than shipping them up and the only
 * version that cannot be edited on the way — a client that assembled its own
 * context could put anything in front of the model and call it a measurement.
 */
export interface AssistantAsk {
  topic: AssistantTopic;
  /** Empty when the question is not about one particular field. */
  fieldId: string;
  /** The conversation so far, oldest first, ending in the new question. */
  messages: AiMessage[];
}

export interface AssistantReply {
  reply: string;
  /** Which vendor answered. Shown to the user; never a key or an endpoint. */
  provider: AiProvider;
  model: string;
}

export interface AssistantFailure {
  error: string;
  /** Set when the server has no provider configured, so the UI can say so. */
  unconfigured?: boolean;
}

export function isAssistantTopic(value: unknown): value is AssistantTopic {
  return typeof value === "string" && (ASSISTANT_TOPICS as readonly string[]).includes(value);
}

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Reduces whatever arrived to a conversation all three vendors will accept.
 *
 * Blank turns are dropped rather than sent: an empty string is a 400 on
 * Anthropic and a wasted turn everywhere else. Consecutive turns from the same
 * role are merged — Anthropic would combine them silently and Gemini would
 * reject them, so doing it here keeps the two from disagreeing. What is left is
 * trimmed to the most recent `MAX_TURNS` and then to the first user turn, since
 * a window that happens to start on an assistant turn is rejected by two of the
 * three.
 */
export function sanitizeMessages(value: unknown): AiMessage[] {
  if (!Array.isArray(value)) return [];

  const merged: AiMessage[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const role: AiRole = source.role === "assistant" ? "assistant" : "user";
    const content =
      typeof source.content === "string" ? source.content.trim().slice(0, MAX_QUESTION_CHARS) : "";
    if (content === "") continue;

    const last = merged[merged.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${content}`.slice(0, MAX_QUESTION_CHARS);
    } else {
      merged.push({ role, content });
    }
  }

  const recent = merged.slice(-MAX_TURNS);
  const firstUser = recent.findIndex((message) => message.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

/** Whether a sanitised conversation is something the route can actually send. */
export function isSendable(messages: AiMessage[]): boolean {
  return messages.length > 0 && messages[messages.length - 1].role === "user";
}
