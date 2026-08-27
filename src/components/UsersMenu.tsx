"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Clock,
  Edit,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import AccountDialog from "@/components/AccountDialog";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { type FieldPolygon } from "@/components/Map";
import {
  ACCOUNT_ROLES,
  ROLE_ACCESS,
  ROLE_COLORS,
  ROLE_DESCRIPTIONS,
  ROLE_SHORT_TITLES,
  ROLE_TITLES,
  hasAllFields,
  initialsFor,
  type AccountRole,
  type PublicAccount,
} from "@/lib/auth";
import { type ActivityItem } from "@/lib/team";
import { t } from "@/lib/translations";
import { useAccounts } from "@/lib/use-accounts";

/**
 * The team panel in the header: who is on this farm, what each role may do, and
 * what has happened lately.
 *
 * The list it shows is the account list — one record per person, profile and
 * sign-in together — read through `useAccounts`, the same hook the Users page
 * uses. There used to be a second, browser-only team list here with its own
 * add/edit forms and a "switch user" button that only pretended to change who
 * you were; that is gone. Who you are is the session, and it is shown at the
 * top of this panel.
 */

export type { ActivityItem };

interface UsersMenuProps {
  fields?: FieldPolygon[];
  activities?: ActivityItem[];
  onAddActivity?: (action: string, type?: ActivityItem["type"]) => void;
  onClearActivities?: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return "Yesterday";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function roleBadgeStyle(role: AccountRole): string {
  switch (role) {
    case "admin":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    case "agronomist":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800";
    case "operator":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    case "viewer":
      return "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800";
  }
}

const ROLE_CARD_STYLES: Record<AccountRole, { box: string; title: string; pill: string; icon: typeof ShieldCheck }> = {
  admin: {
    box: "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20",
    title: "text-emerald-800 dark:text-emerald-300",
    pill: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300",
    icon: ShieldCheck,
  },
  agronomist: {
    box: "border-sky-200 dark:border-sky-800/60 bg-sky-50/40 dark:bg-sky-950/20",
    title: "text-sky-800 dark:text-sky-300",
    pill: "bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300",
    icon: Layers,
  },
  operator: {
    box: "border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20",
    title: "text-amber-800 dark:text-amber-300",
    pill: "bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300",
    icon: UserCheck,
  },
  viewer: {
    box: "border-purple-200 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20",
    title: "text-purple-800 dark:text-purple-300",
    pill: "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300",
    icon: Shield,
  },
};

function activityIcon(type?: ActivityItem["type"]) {
  switch (type) {
    case "field_add":
      return { icon: Plus, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60" };
    case "field_delete":
      return { icon: Trash2, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60" };
    case "field_edit":
      return { icon: Edit, color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/60" };
    case "group_add":
      return { icon: Layers, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60" };
    case "user_add":
      return { icon: UserPlus, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60" };
    case "user_edit":
      return { icon: UserCheck, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60" };
    case "import":
      return { icon: MapPin, color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60" };
    default:
      return { icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60" };
  }
}

export default function UsersMenu({
  fields = [],
  activities = [],
  onAddActivity,
  onClearActivities,
}: UsersMenuProps) {
  const { user, logout } = useAuth();
  const { accounts, isLoading, error } = useAccounts();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"team" | "roles" | "activity">("team");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AccountRole>("all");
  const [editing, setEditing] = useState<PublicAccount | null>(null);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.isAdmin === true;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesQuery =
        query === "" ||
        account.name.toLowerCase().includes(query) ||
        account.email.toLowerCase().includes(query) ||
        account.username.toLowerCase().includes(query) ||
        ROLE_TITLES[account.role].toLowerCase().includes(query);
      const matchesRole = roleFilter === "all" || account.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [accounts, searchQuery, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts = { admin: 0, agronomist: 0, operator: 0, viewer: 0 } as Record<AccountRole, number>;
    for (const account of accounts) counts[account.role] += 1;
    return counts;
  }, [accounts]);

  const openAdd = () => {
    setEditing(null);
    setIsAccountDialogOpen(true);
  };

  const openEdit = (account: PublicAccount) => {
    setEditing(account);
    setIsAccountDialogOpen(true);
  };

  const currentInitials = initialsFor({ name: user?.name, username: user?.username });
  const currentColor = user ? ROLE_COLORS[user.role] : "bg-emerald-600 text-white";

  return (
    <div className="relative" ref={menuRef}>
      {/* Top Bar Trigger Button — the signed-in account. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-xs cursor-pointer ${
          isOpen
            ? "bg-zinc-100 border-zinc-300 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 ring-2 ring-emerald-500/20"
            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 hover:border-zinc-300"
        }`}
        title={t.usersTitle}
      >
        <div className="relative flex items-center justify-center">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-xs ${currentColor}`}
          >
            {currentInitials}
          </div>
          {user?.mustChangePassword && (
            <ShieldAlert className="absolute -top-1.5 -right-1.5 w-3 h-3 text-amber-500" />
          )}
        </div>

        <div className="flex-col text-left leading-tight hidden sm:flex">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate max-w-[110px]">
            {user?.name || user?.username}
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[110px]">
            {user ? ROLE_SHORT_TITLES[user.role] : ""}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-zinc-700 dark:text-zinc-200" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[340px] sm:w-[410px] rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-800 p-4 shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Header: the session, and the ways out of it. */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-zinc-50 to-emerald-50/40 dark:from-zinc-800/70 dark:to-emerald-950/20 border border-zinc-200/70 dark:border-zinc-700/60 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${currentColor}`}
                >
                  {currentInitials}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {user?.name || user?.username}
                    </h4>
                    {user && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadgeStyle(
                          user.role
                        )}`}
                      >
                        {ROLE_SHORT_TITLES[user.role]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3 opacity-70" />
                    {user?.email || `@${user?.username}`}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {user?.mustChangePassword && (
              <button
                onClick={() => setIsPasswordOpen(true)}
                className="mt-2.5 w-full flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-2 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 text-left">{t.changePasswordPrompt}</span>
              </button>
            )}

            <div className="mt-2.5 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-700/50 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                {t.activeUser}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsPasswordOpen(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                  title={t.changePasswordBtn}
                >
                  <KeyRound className="w-3 h-3" />
                  {t.changePasswordBtn}
                </button>
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title={t.signOutBtn}
                >
                  <LogOut className="w-3 h-3" />
                  {t.signOutBtn}
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl mb-3 border border-zinc-200/60 dark:border-zinc-700/50 text-xs font-medium">
            {([
              { id: "team", label: `Team (${accounts.length})`, icon: Users },
              { id: "roles", label: "Roles & Access", icon: Shield },
              {
                id: "activity",
                label: `Activity${activities.length > 0 ? ` (${activities.length})` : ""}`,
                icon: Clock,
              },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: the people */}
          {activeTab === "team" && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search person or role..."
                    className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 text-zinc-800 dark:text-zinc-200"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as "all" | AccountRole)}
                  className="py-1.5 px-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-xs outline-none text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  {ACCOUNT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_SHORT_TITLES[role]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-0.5">
                {isLoading && accounts.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : error ? (
                  <div className="text-center py-6 text-xs text-rose-600 dark:text-rose-400">
                    {error}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-6 text-zinc-400 text-xs">
                    No matching people found.
                  </div>
                ) : (
                  filtered.map((account) => {
                    const isMe = account.id === user?.id;
                    const canEditRow = isAdmin || isMe;
                    return (
                      <div
                        key={account.id}
                        className={`group flex items-center justify-between p-2 rounded-xl border transition-all ${
                          isMe
                            ? "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 shadow-xs"
                            : "bg-white dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold shadow-xs ${
                              ROLE_COLORS[account.role]
                            }`}
                          >
                            {initialsFor(account)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">
                                {account.name || account.username}
                              </span>
                              {isMe && (
                                <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 dark:text-emerald-300 px-1.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              <span
                                className={`text-[10px] font-medium px-1.5 rounded border ${roleBadgeStyle(
                                  account.role
                                )}`}
                              >
                                {ROLE_SHORT_TITLES[account.role]}
                              </span>
                              <span className="truncate text-[10px] text-zinc-400">
                                {hasAllFields(account)
                                  ? "All Fields"
                                  : `${account.assignedFieldIds.length} ${
                                      account.assignedFieldIds.length === 1 ? "Field" : "Fields"
                                    }`}
                              </span>
                              {/* Whether this person can get in at all is part
                                  of the same row now, not a separate list. */}
                              <span
                                className={`flex items-center gap-0.5 text-[10px] ${
                                  account.hasLogin
                                    ? "text-zinc-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                                title={
                                  account.hasLogin
                                    ? `Signs in as @${account.username}`
                                    : "No sign-in yet"
                                }
                              >
                                <KeyRound className="w-3 h-3" />
                                {account.hasLogin ? `@${account.username}` : "no sign-in"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {canEditRow && (
                          <button
                            onClick={() => openEdit(account)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 rounded-md transition-colors cursor-pointer"
                            title={isMe && !isAdmin ? "Edit my profile" : "Edit / Permissions"}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {isAdmin && (
                <button
                  onClick={openAdd}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Person</span>
                </button>
              )}

              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 text-center px-1">
                {t.teamNotice}{" "}
                <Link
                  href="/users"
                  className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {t.manageUsersBtn}
                </Link>
              </p>
            </div>
          )}

          {/* TAB 2: what each role may actually do */}
          {activeTab === "roles" && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
              {ACCOUNT_ROLES.map((role) => {
                const style = ROLE_CARD_STYLES[role];
                const Icon = style.icon;
                return (
                  <div key={role} className={`p-2.5 rounded-xl border ${style.box}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold flex items-center gap-1.5 ${style.title}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {ROLE_TITLES[role]}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.pill}`}
                      >
                        {roleCounts[role]} {roleCounts[role] === 1 ? "person" : "people"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      {ROLE_DESCRIPTIONS[role]}
                    </p>
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed mt-1">
                      {ROLE_ACCESS[role]}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: Activity Log */}
          {activeTab === "activity" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500">
                <span>Recent System Activities</span>
                {activities.length > 0 && onClearActivities && (
                  <button
                    onClick={onClearActivities}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
                    title="Clear activity log"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              <div className="max-h-[270px] overflow-y-auto space-y-1.5 pr-0.5">
                {activities.length === 0 ? (
                  <div className="text-center py-8 text-zinc-400 text-xs">
                    No activity recorded yet. Actions like adding fields or people will appear here.
                  </div>
                ) : (
                  activities.map((act) => {
                    const { icon: Icon, color } = activityIcon(act.type);
                    return (
                      <div
                        key={act.id}
                        className="flex items-start gap-2.5 p-2 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30"
                      >
                        <div className={`p-1.5 rounded-lg shrink-0 border ${color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                              {act.user}
                            </span>
                            <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                              {formatRelativeTime(act.timestamp)}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-snug">
                            {act.action}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {toastMessage && (
            <div className="mt-3 p-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[11px] font-medium rounded-lg flex items-center justify-between animate-in fade-in duration-150">
              <span>{toastMessage}</span>
              <button
                onClick={() => setToastMessage(null)}
                className="text-zinc-400 hover:text-white dark:hover:text-zinc-900 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      <AccountDialog
        open={isAccountDialogOpen}
        onOpenChange={setIsAccountDialogOpen}
        account={editing}
        fields={fields.map((field) => ({ id: field.id, name: field.name }))}
        onDone={(message) => {
          showToast(message);
          onAddActivity?.(message, editing ? "user_edit" : "user_add");
        }}
      />

      <ChangePasswordDialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen} />
    </div>
  );
}
