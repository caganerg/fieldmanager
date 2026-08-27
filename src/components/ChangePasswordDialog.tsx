"use client";

import { useState } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/auth";
import { t } from "@/lib/translations";

/**
 * Changing your own password, used in two places: the nudge that follows a
 * sign-in with a password somebody else chose, and the Users page.
 *
 * `nudge` only changes the wording — the dialog can always be closed. An
 * installation that has to stay reachable is better served by a prompt that
 * keeps coming back than by one that locks somebody out of their own map until
 * they have thought of a password.
 */
export default function ChangePasswordDialog({
  open,
  onOpenChange,
  nudge = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nudge?: boolean;
}) {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const close = (next: boolean) => {
    if (!next) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setDone(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const invalid = validatePassword(newPassword);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.passwordsDoNotMatch);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await changePassword(currentPassword, newPassword);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Could not change the password.");
      return;
    }
    setDone(true);
    setTimeout(() => close(false), 1200);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            {nudge ? <ShieldAlert className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
            {nudge ? t.changePasswordTitle : t.changePasswordBtn}
          </DialogTitle>
          <DialogDescription>
            {nudge ? t.changePasswordPrompt : t.accountsDesc}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">{t.currentPasswordLabel}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t.newPasswordLabel}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">{t.confirmPasswordLabel}</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {done && (
            <p className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              {t.passwordChanged}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="lg" onClick={() => close(false)}>
              {nudge ? t.changeLaterBtn : t.cancelBtn}
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.changePasswordBtn}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
