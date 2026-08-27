"use client";

import { useState } from "react";
import { Edit, Info, KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";

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
import {
  ACCOUNT_ROLES,
  ALL_FIELDS,
  MIN_PASSWORD_LENGTH,
  ROLE_ACCESS,
  ROLE_TITLES,
  hasAllFields,
  normalizeUsername,
  type AccountRole,
  type PublicAccount,
} from "@/lib/auth";
import { useAccounts, type AccountInput } from "@/lib/use-accounts";

/**
 * Adding or editing one person, used by both the team panel and the Users page
 * so there is a single form behind the single list.
 *
 * The sign-in part is optional and sits at the bottom: a person can be in the
 * directory without a way in, and an administrator can hand them one here
 * later. Profile fields are open to the person themselves; role, field access
 * and credentials are administrators only, which is also what the API enforces.
 */

const SELECT_CLASS =
  "w-full h-9 px-2.5 bg-background border border-input rounded-md text-xs outline-none focus:ring-1 focus:ring-emerald-500";

interface FormState {
  name: string;
  email: string;
  phone: string;
  role: AccountRole;
  assignedFieldIds: string[];
  allFields: boolean;
  username: string;
  password: string;
}

function formFor(account: PublicAccount | null): FormState {
  return {
    name: account?.name ?? "",
    email: account?.email ?? "",
    phone: account?.phone ?? "",
    role: account?.role ?? "agronomist",
    assignedFieldIds: account && !hasAllFields(account) ? account.assignedFieldIds : [],
    allFields: account ? hasAllFields(account) : true,
    username: account?.username ?? "",
    password: "",
  };
}

export default function AccountDialog({
  open,
  onOpenChange,
  account,
  fields,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null adds somebody new. */
  account: PublicAccount | null;
  fields: { id: string; name: string }[];
  onDone?: (message: string) => void;
}) {
  const { user } = useAuth();
  const { createAccount, updateAccount, deleteAccount } = useAccounts();

  const [form, setForm] = useState<FormState>(() => formFor(account));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The dialog is mounted once per view and re-pointed at whoever is being
  // edited, so the form has to follow the row that opened it. Resetting during
  // render rather than in an effect keeps the first paint correct — an effect
  // would show the previous person for a frame.
  const formKey = `${open ? "open" : "closed"}:${account?.id ?? "new"}`;
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (formKey !== syncedKey) {
    setSyncedKey(formKey);
    setForm(formFor(account));
    setError(null);
  }

  const isAdmin = user?.isAdmin === true;
  const isSelf = account?.id === user?.id;
  const editing = account !== null;

  const patch = (changes: Partial<FormState>) => setForm((prev) => ({ ...prev, ...changes }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!form.name.trim()) {
      setError("A name is required.");
      return;
    }

    const input: Partial<AccountInput> = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };

    if (isAdmin) {
      input.role = form.role;
      input.assignedFieldIds = form.allFields ? [ALL_FIELDS] : form.assignedFieldIds;
      // Sending the username unchanged is harmless; sending an empty one is
      // how a login is taken away again, which the store handles.
      input.username = normalizeUsername(form.username);
      if (form.password) input.password = form.password;
    }

    setBusy(true);
    setError(null);
    const result = editing
      ? await updateAccount(account.id, input)
      : await createAccount(input as AccountInput);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone?.(
      editing ? `"${input.name}" updated.` : `"${input.name}" added to the team.`
    );
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!account) return;
    if (!window.confirm(`Remove "${account.name}" from the team? This cannot be undone.`)) return;
    setBusy(true);
    const result = await deleteAccount(account.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone?.(`"${account.name}" removed.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base font-bold text-zinc-900 dark:text-zinc-100">
            <span className="flex items-center gap-2">
              {editing ? (
                <Edit className="w-5 h-5 text-emerald-600" />
              ) : (
                <UserPlus className="w-5 h-5 text-emerald-600" />
              )}
              {editing ? "Edit Person" : "Add Person"}
            </span>
            {editing && isAdmin && !isSelf && (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 p-1 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            {isAdmin
              ? "Profile, role, field access and — if this person should be able to sign in — a username and password."
              : "You can keep your own profile up to date. Roles and sign-in details are an administrator's to change."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Full Name</Label>
            <Input
              required
              placeholder="e.g. Ayşe Yılmaz"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              className="h-9 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email Address</Label>
              <Input
                type="email"
                placeholder="ayse@example.com"
                value={form.email}
                onChange={(event) => patch({ email: event.target.value })}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Phone Number</Label>
              <Input
                value={form.phone}
                onChange={(event) => patch({ phone: event.target.value })}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Role</Label>
            <select
              value={form.role}
              disabled={!isAdmin || isSelf}
              onChange={(event) => patch({ role: event.target.value as AccountRole })}
              className={`${SELECT_CLASS} disabled:opacity-60`}
            >
              {ACCOUNT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_TITLES[role]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
              {isSelf && isAdmin ? "You cannot change your own role." : ROLE_ACCESS[form.role]}
            </p>
          </div>

          {/* Field assignment: which fields this person is responsible for. */}
          <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Assigned Fields</Label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allFields}
                  disabled={!isAdmin}
                  onChange={(event) =>
                    patch({
                      allFields: event.target.checked,
                      assignedFieldIds: event.target.checked ? [] : fields.map((f) => f.id),
                    })
                  }
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                All Fields
              </label>
            </div>

            {!form.allFields && (
              <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
                {fields.length === 0 ? (
                  <p className="text-[11px] text-zinc-400">No fields added to the map yet.</p>
                ) : (
                  fields.map((field) => (
                    <label
                      key={field.id}
                      className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        disabled={!isAdmin}
                        checked={form.assignedFieldIds.includes(field.id)}
                        onChange={(event) =>
                          patch({
                            assignedFieldIds: event.target.checked
                              ? [...form.assignedFieldIds, field.id]
                              : form.assignedFieldIds.filter((id) => id !== field.id),
                          })
                        }
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{field.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Sign-in. Optional: somebody can be on the team without an account. */}
          {isAdmin && (
            <div className="space-y-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                Sign-in
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Username</Label>
                  <Input
                    value={form.username}
                    placeholder="none"
                    disabled={isSelf}
                    onChange={(event) =>
                      patch({ username: normalizeUsername(event.target.value) })
                    }
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {account?.hasLogin ? "New password" : "Password"}
                  </Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder={account?.hasLogin ? "leave blank to keep" : ""}
                    disabled={isSelf}
                    value={form.password}
                    onChange={(event) => patch({ password: event.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
                <span>
                  {isSelf
                    ? "Your own username and password are changed from your profile, where the current password is asked for first."
                    : `Leave both blank for somebody who has no reason to sign in yet. A password must be at least ${MIN_PASSWORD_LENGTH} characters; the person is asked to replace it after signing in, and clearing the username takes the login away again.`}
                </span>
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editing ? "Save Changes" : "Add Person"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
