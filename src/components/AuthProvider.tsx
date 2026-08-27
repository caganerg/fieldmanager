"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { type SessionUser } from "@/lib/auth";

/**
 * Who this browser is signed in as.
 *
 * The session itself is an httpOnly cookie the browser cannot read, so this
 * asks the server once on mount and keeps the answer. Nothing here is
 * persisted: a reload asks again, which is what makes a revoked account or a
 * reset password take effect without the client having to be told.
 *
 * `status` starts at "loading" so no page has to guess whether an empty user
 * means guest or means the answer has not arrived — the difference matters,
 * since one of them redirects.
 */

const SESSION_ENDPOINT = "/api/auth/session";

export type AuthStatus = "loading" | "guest" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  /** True once the first session request has come back, either way. */
  ready: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Re-reads the session; used after a 401 from another endpoint. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>.");
  return value;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return (body && typeof body.error === "string" && body.error) || fallback;
}

interface SessionAnswer {
  user: SessionUser | null;
  error: string | null;
}

/**
 * Asks the server who this browser is. Kept outside the component and free of
 * state so both the first read and every later refresh go through one path.
 */
async function fetchSession(): Promise<SessionAnswer> {
  try {
    const response = await fetch(SESSION_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`Server responded with ${response.status}.`);
    const body = (await response.json()) as { user: SessionUser | null };
    return { user: body.user, error: null };
  } catch (sessionError) {
    console.error("Could not read the session:", sessionError);
    // An unreachable server is treated as signed out. Showing the workspace
    // shell to somebody the server will refuse anyway only misleads them.
    return {
      user: null,
      error: sessionError instanceof Error ? sessionError.message : "Could not reach the server.",
    };
  }
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((answer: SessionAnswer) => {
    setUser(answer.user);
    setStatus(answer.user ? "authenticated" : "guest");
    setError(answer.error);
    setReady(true);
  }, []);

  const refresh = useCallback(async () => {
    applySession(await fetchSession());
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then((answer) => {
      if (!cancelled) applySession(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        return { ok: false, error: await readError(response, "Could not sign in.") };
      }
      const body = (await response.json()) as { user: SessionUser };
      setUser(body.user);
      setStatus("authenticated");
      setError(null);
      return { ok: true };
    } catch (loginError) {
      console.error("Could not sign in:", loginError);
      return { ok: false, error: "Could not reach the server." };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(SESSION_ENDPOINT, { method: "DELETE" });
    } catch (logoutError) {
      console.error("Could not sign out cleanly:", logoutError);
    }
    setUser(null);
    setStatus("guest");
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      try {
        const response = await fetch("/api/auth/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        if (!response.ok) {
          return { ok: false, error: await readError(response, "Could not change the password.") };
        }
        const body = (await response.json()) as { user: SessionUser };
        setUser(body.user);
        setStatus("authenticated");
        return { ok: true };
      } catch (passwordError) {
        console.error("Could not change the password:", passwordError);
        return { ok: false, error: "Could not reach the server." };
      }
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{ status, user, ready, error, login, logout, changePassword, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}
