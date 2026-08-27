"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, LogIn, Trees } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/translations";

/**
 * The sign-in page. Nothing else in the app collects a password, and this page
 * asks the server for nothing but the session it is trying to create — a guest
 * who lands here has not read a single row of workspace data.
 */
export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Somebody who is already signed in has no business on this page; send them
  // to the map rather than inviting a second sign-in.
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await login(username, password);
    if (!result.ok) {
      setBusy(false);
      setError(result.error || "Could not sign in.");
      return;
    }
    router.replace("/");
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <Trees className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {t.signInTitle}
          </h1>
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            {t.signInSubtitle}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl"
        >
          <div className="space-y-1.5">
            <Label htmlFor="username">{t.usernameLabel}</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{t.passwordLabel}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {busy ? t.signingIn : t.signInBtn}
          </Button>

          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {t.firstRunHint}
          </p>
        </form>

        <Link
          href="/"
          className="mt-6 flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t.backToMap}
        </Link>
      </div>
    </div>
  );
}
