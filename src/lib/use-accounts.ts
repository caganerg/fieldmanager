"use client";

import useSWR from "swr";

import { type AccountRole, type PublicAccount } from "@/lib/auth";

/**
 * The one list of people, shared by the team panel and the Users page.
 *
 * SWR keeps a single cache entry behind `/api/accounts`, so both views show the
 * same rows and a change made in either refreshes the other — the whole point
 * of merging the directory and the accounts into one record is undone if two
 * components each keep their own copy.
 */

const ENDPOINT = "/api/accounts";

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return (body && typeof body.error === "string" && body.error) || fallback;
}

async function fetcher(url: string): Promise<PublicAccount[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Could not load the team."));
  const body = (await response.json()) as { accounts: PublicAccount[] };
  return body.accounts;
}

export interface AccountInput {
  name: string;
  email?: string;
  phone?: string;
  role: AccountRole;
  assignedFieldIds?: string[];
  username?: string;
  password?: string;
}

export type AccountResult = { ok: true; account?: PublicAccount } | { ok: false; error: string };

export function useAccounts(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<PublicAccount[]>(
    enabled ? ENDPOINT : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const accounts = data ?? [];

  async function send(url: string, method: string, payload?: unknown): Promise<AccountResult> {
    try {
      const response = await fetch(url, {
        method,
        ...(payload === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }),
      });
      if (!response.ok) {
        return { ok: false, error: await readError(response, "Could not save.") };
      }
      const body = (await response.json().catch(() => null)) as
        | { account?: PublicAccount }
        | null;
      await mutate();
      return { ok: true, account: body?.account };
    } catch {
      return { ok: false, error: "Could not reach the server." };
    }
  }

  return {
    accounts,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
    createAccount: (input: AccountInput) => send(ENDPOINT, "POST", input),
    updateAccount: (id: string, input: Partial<AccountInput>) =>
      send(`${ENDPOINT}/${id}`, "PATCH", input),
    deleteAccount: (id: string) => send(`${ENDPOINT}/${id}`, "DELETE"),
  };
}
