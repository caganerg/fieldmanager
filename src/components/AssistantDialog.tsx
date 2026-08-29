"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";

import { useAssistant } from "@/components/AssistantProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MAX_QUESTION_CHARS, type AssistantTopic } from "@/lib/ai";
import { t } from "@/lib/translations";

const TOPIC_LABELS: Record<AssistantTopic, string> = {
  general: t.assistant.contextGeneral,
  fertilizer: t.assistant.contextFertilizer,
  soil: t.assistant.contextSoil,
  protection: t.assistant.contextProtection,
};

interface AssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AssistantDialog({ open, onOpenChange }: AssistantDialogProps) {
  const { messages, context, pending, error, unconfigured, answeredBy, ask, reset } =
    useAssistant();

  const [question, setQuestion] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  // Follow the conversation down as it grows, including while an answer is
  // still on its way — the pending row is the thing worth keeping in view.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, pending]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed === "" || pending) return;
    ask(trimmed);
    setQuestion("");
  };

  // Enter sends, Shift+Enter breaks the line: this is a chat box, and a
  // question long enough to need paragraphs is the rare case.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(event);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
            <Sparkles className="w-5 h-5" />
            {t.assistant.title}
          </DialogTitle>
          <DialogDescription>{t.featureAssistantDesc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* What the next question will be answered against. */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                {TOPIC_LABELS[context.topic]}
              </span>
              {context.fieldName && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {context.fieldName}
                </span>
              )}
            </span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                {t.assistant.newChat}
              </button>
            )}
          </div>

          <div
            ref={threadRef}
            className="h-64 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-3 space-y-2.5"
          >
            {messages.length === 0 && !pending && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center px-4 py-10">
                {t.assistant.intro}
              </p>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                    message.role === "user"
                      ? "bg-violet-600 text-white"
                      : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {pending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t.assistant.thinking}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/60">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-rose-700 dark:text-rose-300">
                {unconfigured ? t.assistant.unconfigured : error}
              </p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-2">
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                maxLength={MAX_QUESTION_CHARS}
                className="flex-1 resize-none text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-2 text-zinc-800 dark:text-zinc-200 outline-none focus:border-violet-400 dark:focus:border-violet-600"
                placeholder={t.assistant.placeholder}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button
                type="submit"
                size="sm"
                disabled={pending || question.trim() === ""}
                className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-9 px-3 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="sr-only">{t.assistant.send}</span>
              </Button>
            </div>

            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {answeredBy
                ? `${t.assistant.answeredBy.replace("{model}", answeredBy)} · ${t.assistant.disclaimer}`
                : t.assistant.disclaimer}
            </p>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
