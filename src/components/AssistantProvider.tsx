"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import AssistantDialog from "@/components/AssistantDialog";
import {
  isSendable,
  sanitizeMessages,
  type AiMessage,
  type AssistantReply,
  type AssistantTopic,
} from "@/lib/ai";
import { t } from "@/lib/translations";

/**
 * One assistant, reached from three places.
 *
 * The tool bar asks it general questions, the fertilisation dialog asks it
 * about a dosage and the soil dialog about a report — but it is the same
 * assistant and the same conversation throughout, which is why the thread lives
 * here rather than inside any one of them. Opening it from the soil module
 * after asking about fertiliser continues where that left off instead of
 * starting a third parallel chat.
 *
 * What each entry point contributes is the *context*: which topic the next
 * question is about and which field, if any. That travels with the request; the
 * server is what turns it into the records the model reads, so nothing here has
 * to know how a prompt is assembled.
 */

export interface AssistantContext {
  topic: AssistantTopic;
  fieldId: string;
  /** For the header chip only — the server resolves the id to real data. */
  fieldName: string;
}

interface AssistantValue {
  /** The thread so far, oldest first. */
  messages: AiMessage[];
  context: AssistantContext;
  pending: boolean;
  error: string | null;
  /** The server has no provider configured; retrying will not help. */
  unconfigured: boolean;
  /** Which model answered last, when one has. */
  answeredBy: string;
  openAssistant: (context: Partial<AssistantContext>) => void;
  closeAssistant: () => void;
  ask: (question: string) => void;
  reset: () => void;
}

const GENERAL: AssistantContext = { topic: "general", fieldId: "", fieldName: "" };

const AssistantStore = createContext<AssistantValue | null>(null);

export function useAssistant(): AssistantValue {
  const value = useContext(AssistantStore);
  if (!value) throw new Error("useAssistant must be used inside an AssistantProvider");
  return value;
}

export default function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<AssistantContext>(GENERAL);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [answeredBy, setAnsweredBy] = useState("");

  const openAssistant = useCallback((next: Partial<AssistantContext>) => {
    setContext({ ...GENERAL, ...next });
    setError(null);
    setOpen(true);
  }, []);

  const closeAssistant = useCallback(() => setOpen(false), []);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setUnconfigured(false);
    setAnsweredBy("");
  }, []);

  const ask = useCallback(
    (question: string) => {
      if (pending) return;
      // Sanitising here as well as on the route is not belt and braces: it is
      // what decides whether there is anything to send at all, and it merges
      // the turns the same way the server will, so the thread the user sees
      // matches the one the model is given.
      const next = sanitizeMessages([...messages, { role: "user", content: question }]);
      if (!isSendable(next)) return;

      setMessages(next);
      setPending(true);
      setError(null);
      setUnconfigured(false);

      const body = JSON.stringify({
        topic: context.topic,
        fieldId: context.fieldId,
        messages: next,
      });

      fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
        .then(async (response) => {
          // A route that is missing or broken answers with HTML, not JSON, so
          // the parse is the thing that has to be guarded rather than the
          // status — an unreadable body is a failure whatever the code says.
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload || typeof payload.reply !== "string") {
            const message =
              payload && typeof payload.error === "string" ? payload.error : t.assistant.failed;
            setUnconfigured(Boolean(payload?.unconfigured));
            setError(message);
            return;
          }
          const answer = payload as AssistantReply;
          setMessages((prev) => [...prev, { role: "assistant", content: answer.reply }]);
          setAnsweredBy(answer.model || "");
        })
        .catch(() => setError(t.assistant.failed))
        .finally(() => setPending(false));
    },
    [context.fieldId, context.topic, messages, pending]
  );

  const value = useMemo<AssistantValue>(
    () => ({
      messages,
      context,
      pending,
      error,
      unconfigured,
      answeredBy,
      openAssistant,
      closeAssistant,
      ask,
      reset,
    }),
    [
      messages,
      context,
      pending,
      error,
      unconfigured,
      answeredBy,
      openAssistant,
      closeAssistant,
      ask,
      reset,
    ]
  );

  return (
    <AssistantStore.Provider value={value}>
      {children}
      {/* Mounted here so no caller has to remember to render it. */}
      <AssistantDialog open={open} onOpenChange={setOpen} />
    </AssistantStore.Provider>
  );
}
