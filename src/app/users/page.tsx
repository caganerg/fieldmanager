"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  Users,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import AccountDialog from "@/components/AccountDialog";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_ROLES,
  ROLE_ACCESS,
  ROLE_COLORS,
  ROLE_SHORT_TITLES,
  ROLE_TITLES,
  hasAllFields,
  initialsFor,
  type PublicAccount,
} from "@/lib/auth";
import { t } from "@/lib/translations";
import { useAccounts } from "@/lib/use-accounts";

/**
 * The Users page: the same list of people as the panel on the map, with room to
 * see all of it at once.
 *
 * One record per person — profile, role, assigned fields and the sign-in they
 * use if they have one — read through `useAccounts`, so a change made here
 * shows up in the panel and the other way round.
 */

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  agronomist: "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  operator: "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  viewer: "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800",
};

function formatDate(value?: string): string {
  if (!value) return t.neverSignedIn;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return t.neverSignedIn;
  return new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Field names for the assignment checkboxes. The map's data provider is not
 * mounted on this page, so the list is read straight from the workspace
 * document — the same endpoint, minus the editing machinery.
 */
function useFieldNames(enabled: boolean): { id: string; name: string }[] {
  const { data } = useSWR<{ fields: { id: string; name: string }[] }>(
    enabled ? "/api/data" : null,
    async (url: string) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not read the fields.");
      return response.json();
    },
    { revalidateOnFocus: false }
  );
  return (data?.fields ?? []).map((field) => ({ id: field.id, name: field.name }));
}

export default function UsersPage() {
  const router = useRouter();
  const { user, status, ready, logout } = useAuth();
  const signedIn = status === "authenticated";

  const { accounts, isLoading, error, refresh, deleteAccount } = useAccounts(signedIn);
  const fields = useFieldNames(signedIn);

  const [editing, setEditing] = useState<PublicAccount | null>(null);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAdmin = user?.isAdmin === true;

  // A guest has nothing to manage here, and no way to be told anything useful
  // on this page, so send them to sign in.
  useEffect(() => {
    if (ready && status === "guest") router.replace("/login");
  }, [ready, status, router]);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 3500);
  };

  const openAdd = () => {
    setEditing(null);
    setIsAccountDialogOpen(true);
  };

  const openEdit = (account: PublicAccount) => {
    setEditing(account);
    setIsAccountDialogOpen(true);
  };

  const removeAccount = async (account: PublicAccount) => {
    if (!window.confirm(`Remove "${account.name}" from the team? This cannot be undone.`)) return;
    const result = await deleteAccount(account.id);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionError(null);
    showNotice(`"${account.name}" removed.`);
  };

  if (!ready || status === "guest") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  const me = accounts.find((account) => account.id === user?.id);

  return (
    <div className="min-h-dvh bg-zinc-100 dark:bg-zinc-950">
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.backToMap}
            </Link>
            <span className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
            <h1 className="flex items-center gap-2 text-base font-semibold text-zinc-800 dark:text-zinc-100">
              <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              {t.accountsTitle}
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout().then(() => router.replace("/login"))}
          >
            <LogOut className="w-3.5 h-3.5" />
            {t.signOutBtn}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {notice && (
          <p className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            {notice}
          </p>
        )}

        {/* Your own record: the one thing every role can act on. */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-sm ${
                  user ? ROLE_COLORS[user.role] : ""
                }`}
              >
                {initialsFor({ name: user?.name, username: user?.username })}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {user?.name || user?.username}
                  <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    {t.hasLoginLabel} @{user?.username}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {user && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[user.role]}`}
                    >
                      {ROLE_TITLES[user.role]}
                    </span>
                  )}
                  {user?.mustChangePassword && (
                    <span className="flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      <ShieldAlert className="w-3 h-3" />
                      {t.defaultPasswordBadge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {ROLE_ACCESS[user?.role ?? "viewer"]}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {me && (
                <Button size="lg" variant="outline" onClick={() => openEdit(me)}>
                  <Pencil className="w-4 h-4" />
                  {t.editUserBtn}
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={() => setIsPasswordOpen(true)}>
                <KeyRound className="w-4 h-4" />
                {t.changePasswordBtn}
              </Button>
            </div>
          </div>
        </section>

        {/* Everyone, and what each of them may do. */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {t.usersTitle} ({accounts.length})
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{t.accountsDesc}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                Refresh
              </Button>
              {isAdmin && (
                <Button size="sm" onClick={openAdd}>
                  <Plus className="w-3.5 h-3.5" />
                  {t.addAccountBtn}
                </Button>
              )}
            </div>
          </div>

          {!isAdmin && (
            <p className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              {t.accountsAdminOnly}
            </p>
          )}

          {(error || actionError) && (
            <p className="m-6 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {actionError || error}
            </p>
          )}

          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {accounts.map((account) => {
              const isMe = account.id === user?.id;
              return (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ${
                        ROLE_COLORS[account.role]
                      }`}
                    >
                      {initialsFor(account)}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {account.name || account.username}
                        {isMe && (
                          <span className="rounded bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                            You
                          </span>
                        )}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[account.role]}`}
                        >
                          {ROLE_SHORT_TITLES[account.role]}
                        </span>
                        {account.hasLogin ? (
                          <span className="flex items-center gap-1 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                            <KeyRound className="w-3 h-3" />@{account.username}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:text-amber-300">
                            <KeyRound className="w-3 h-3" />
                            {t.noLoginBadge}
                          </span>
                        )}
                        {account.mustChangePassword && (
                          <span className="rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                            {t.defaultPasswordBadge}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {account.email || "—"} ·{" "}
                        {hasAllFields(account)
                          ? t.allFieldsAccess
                          : `${account.assignedFieldIds.length} ${
                              account.assignedFieldIds.length === 1 ? "field" : "fields"
                            }`}
                        {isAdmin && ` · ${t.lastSignIn}: ${formatDate(account.lastLoginAt)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {(isAdmin || isMe) && (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(account)}>
                        <Pencil className="w-3.5 h-3.5" />
                        {t.editUserBtn}
                      </Button>
                    )}
                    {isAdmin && !isMe && (
                      <Button variant="destructive" size="sm" onClick={() => removeAccount(account)}>
                        {t.deleteBtn}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
            {accounts.length === 0 && !isLoading && (
              <li className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Nobody here yet.
              </li>
            )}
          </ul>
        </section>

        {/* What the roles mean — the same rules the server enforces. */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {t.usersTabRoles}
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            {ACCOUNT_ROLES.map((role) => (
              <div
                key={role}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3"
              >
                <dt className="flex items-center justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                  {ROLE_TITLES[role]}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[role]}`}
                  >
                    {accounts.filter((account) => account.role === role).length}
                  </span>
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {ROLE_ACCESS[role]}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <AccountDialog
        open={isAccountDialogOpen}
        onOpenChange={setIsAccountDialogOpen}
        account={editing}
        fields={fields}
        onDone={showNotice}
      />
      <ChangePasswordDialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen} />
    </div>
  );
}
