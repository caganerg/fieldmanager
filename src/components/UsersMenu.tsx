"use client";

import { useState, useRef, useEffect } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  UserCheck,
  Clock,
  MapPin,
  Mail,
  Search,
  Edit,
  Trash2,
  X,
  ChevronDown,
  Sparkles,
  Info,
  Layers,
  Plus,
  RotateCcw,
} from "lucide-react";
import { type FieldPolygon } from "@/components/Map";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface UserMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "agronomist" | "operator" | "viewer";
  roleTitle: string;
  initials: string;
  status: "online" | "in_field" | "on_leave" | "offline";
  statusText: string;
  assignedFieldIds: string[]; // "all" or specific field ids
  joinedDate: string;
  lastActive: string;
  color: string;
}

export interface ActivityItem {
  id: string;
  user: string;
  action: string;
  timestamp: number;
  type?: "field_add" | "field_edit" | "field_delete" | "group_add" | "user_add" | "user_edit" | "import" | "default";
}

interface UsersMenuProps {
  fields?: FieldPolygon[];
  activities?: ActivityItem[];
  onAddActivity?: (action: string, type?: ActivityItem["type"]) => void;
  onClearActivities?: () => void;
  activeUserName?: string;
  onActiveUserChange?: (userName: string) => void;
}

const DEFAULT_USERS: UserMember[] = [
  {
    id: "u1",
    name: "Guest",
    email: "guest@fieldmanager.local",
    phone: "+1 (555) 000-0000",
    role: "admin",
    roleTitle: "System Administrator (Admin)",
    initials: "GU",
    status: "online",
    statusText: "Online",
    assignedFieldIds: ["all"],
    joinedDate: "01/01/2026",
    lastActive: "Active now",
    color: "bg-emerald-600 text-white",
  },
];

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return "Yesterday";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function UsersMenu({
  fields = [],
  activities = [],
  onAddActivity,
  onClearActivities,
  onActiveUserChange,
}: UsersMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"team" | "roles" | "activity">("team");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeModal, setActiveModal] = useState<"add" | "edit" | "profile" | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserMember | null>(null);
  const [activeUserId, setActiveUserId] = useState<string>("u1");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Users state with local storage persistence
  const [users, setUsers] = useState<UserMember[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fieldmanager-users");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Filter out old mock dummy users (u2, u3, u4) and update u1 to Guest if previously Çağan
            const clean = parsed
              .filter((u: UserMember) => !["u2", "u3", "u4"].includes(u.id))
              .map((u: UserMember) => {
                if (u.id === "u1" && (u.name === "Çağan Ergün" || u.name === "Çağan ERGÜN")) {
                  return { ...u, name: "Guest", email: "guest@fieldmanager.local", initials: "GU" };
                }
                return u;
              });
            if (clean.length > 0) return clean;
          }
        } catch (e) {
          console.error("Error reading saved users:", e);
        }
      }
    }
    return DEFAULT_USERS;
  });

  // Save users to localStorage
  useEffect(() => {
    localStorage.setItem("fieldmanager-users", JSON.stringify(users));
  }, [users]);

  // Add User Form State
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "agronomist" as "admin" | "agronomist" | "operator" | "viewer",
    status: "online" as "online" | "in_field" | "on_leave" | "offline",
    assignedFieldIds: [] as string[],
    allFields: true,
  });

  // Edit User Form State
  const [editUserForm, setEditUserForm] = useState<{
    id: string;
    name: string;
    email: string;
    phone: string;
    role: "admin" | "agronomist" | "operator" | "viewer";
    status: "online" | "in_field" | "on_leave" | "offline";
    assignedFieldIds: string[];
    allFields: boolean;
  }>({
    id: "",
    name: "",
    email: "",
    phone: "",
    role: "agronomist",
    status: "online",
    assignedFieldIds: [],
    allFields: true,
  });

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const currentUser = users.find((u) => u.id === activeUserId) || users[0];

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
      case "agronomist":
        return "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800";
      case "operator":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800";
      case "viewer":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800";
      default:
        return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700";
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case "online":
        return "bg-emerald-500 ring-4 ring-emerald-500/20";
      case "in_field":
        return "bg-amber-500 ring-4 ring-amber-500/20";
      case "on_leave":
        return "bg-blue-400 ring-4 ring-blue-400/20";
      case "offline":
      default:
        return "bg-zinc-400 ring-4 ring-zinc-400/20";
    }
  };

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.name.trim() || !newUserForm.email.trim()) return;

    const names = newUserForm.name.trim().split(" ");
    const initials =
      names.length > 1
        ? (names[0][0] + names[names.length - 1][0]).toUpperCase()
        : names[0].slice(0, 2).toUpperCase();

    const roleTitles: Record<string, string> = {
      admin: "System Administrator (Admin)",
      agronomist: "Agronomist",
      operator: "Field & Equipment Operator",
      viewer: "Field Observer",
    };

    const colors: Record<string, string> = {
      admin: "bg-emerald-600 text-white",
      agronomist: "bg-sky-600 text-white",
      operator: "bg-amber-600 text-white",
      viewer: "bg-purple-600 text-white",
    };

    const statusTexts: Record<string, string> = {
      online: "Online",
      in_field: "In Field / Inspection",
      on_leave: "On Leave",
      offline: "Offline",
    };

    const newUser: UserMember = {
      id: "u_" + Math.random().toString(36).substr(2, 7),
      name: newUserForm.name.trim(),
      email: newUserForm.email.trim(),
      phone: newUserForm.phone.trim() || "+1 (555) 000-0000",
      role: newUserForm.role,
      roleTitle: roleTitles[newUserForm.role],
      initials,
      status: newUserForm.status,
      statusText: statusTexts[newUserForm.status],
      assignedFieldIds: newUserForm.allFields ? ["all"] : newUserForm.assignedFieldIds,
      joinedDate: new Date().toLocaleDateString("en-US"),
      lastActive: "Just joined",
      color: colors[newUserForm.role] || "bg-zinc-600 text-white",
    };

    setUsers([newUser, ...users]);
    setActiveModal(null);
    setNewUserForm({
      name: "",
      email: "",
      phone: "",
      role: "agronomist",
      status: "online",
      assignedFieldIds: [],
      allFields: true,
    });
    showToast(`"${newUser.name}" added successfully!`);
    onAddActivity?.(`Added new team member "${newUser.name}" (${newUser.roleTitle})`, "user_add");
  };

  const handleEditUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserForm.id || !editUserForm.name.trim()) return;

    const names = editUserForm.name.trim().split(" ");
    const initials =
      names.length > 1
        ? (names[0][0] + names[names.length - 1][0]).toUpperCase()
        : names[0].slice(0, 2).toUpperCase();

    const roleTitles: Record<string, string> = {
      admin: "System Administrator (Admin)",
      agronomist: "Agronomist",
      operator: "Field & Equipment Operator",
      viewer: "Field Observer",
    };

    const statusTexts: Record<string, string> = {
      online: "Online",
      in_field: "In Field / Inspection",
      on_leave: "On Leave",
      offline: "Offline",
    };

    setUsers(
      users.map((u) =>
        u.id === editUserForm.id
          ? {
              ...u,
              name: editUserForm.name.trim(),
              email: editUserForm.email.trim(),
              phone: editUserForm.phone.trim(),
              role: editUserForm.role,
              roleTitle: roleTitles[editUserForm.role],
              initials,
              status: editUserForm.status,
              statusText: statusTexts[editUserForm.status],
              assignedFieldIds: editUserForm.allFields
                ? ["all"]
                : editUserForm.assignedFieldIds,
            }
          : u
      )
    );

    setActiveModal(null);
    showToast("User details updated successfully!");
    onAddActivity?.(`Updated team member "${editUserForm.name}"`, "user_edit");
  };

  const handleDeleteUser = (id: string) => {
    if (id === "u1") {
      alert("Primary administrator account cannot be deleted.");
      return;
    }
    const target = users.find((u) => u.id === id);
    setUsers(users.filter((u) => u.id !== id));
    if (activeUserId === id) {
      setActiveUserId("u1");
      onActiveUserChange?.("Guest");
    }
    setActiveModal(null);
    showToast(`"${target?.name}" removed.`);
    onAddActivity?.(`Removed team member "${target?.name || id}"`, "user_edit");
  };

  const openEditModal = (user: UserMember) => {
    setSelectedUser(user);
    setEditUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      assignedFieldIds: user.assignedFieldIds,
      allFields: user.assignedFieldIds.includes("all"),
    });
    setActiveModal("edit");
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.roleTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getDisplayRoleName = (role: string) => {
    switch (role) {
      case "admin":
        return "Admin";
      case "agronomist":
        return "Agronomist";
      case "operator":
        return "Operator";
      case "viewer":
        return "Observer";
      default:
        return "Member";
    }
  };

  const getActivityIconAndColor = (type?: ActivityItem["type"]) => {
    switch (type) {
      case "field_add":
        return {
          icon: Plus,
          color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60",
        };
      case "field_delete":
        return {
          icon: Trash2,
          color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60",
        };
      case "field_edit":
        return {
          icon: Edit,
          color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/60",
        };
      case "group_add":
        return {
          icon: Layers,
          color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60",
        };
      case "user_add":
        return {
          icon: UserPlus,
          color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60",
        };
      case "user_edit":
        return {
          icon: UserCheck,
          color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60",
        };
      case "import":
        return {
          icon: MapPin,
          color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60",
        };
      default:
        return {
          icon: ShieldCheck,
          color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60",
        };
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Top Bar Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-xs cursor-pointer ${
          isOpen
            ? "bg-zinc-100 border-zinc-300 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 ring-2 ring-emerald-500/20"
            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 hover:border-zinc-300"
        }`}
        title="User & Team Management"
      >
        {/* User Avatar with Status Indicator */}
        <div className="relative flex items-center justify-center">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-xs ${
              currentUser.color || "bg-emerald-600 text-white"
            }`}
          >
            {currentUser.initials}
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${getStatusDot(
              currentUser.status
            )}`}
          />
        </div>

        {/* User Info Label */}
        <div className="flex flex-col text-left leading-tight hidden sm:flex">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate max-w-[110px]">
            {currentUser.name}
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 capitalize truncate max-w-[110px]">
            {getDisplayRoleName(currentUser.role)}
          </span>
        </div>

        {/* Dropdown Icon */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-zinc-700 dark:text-zinc-200" : ""
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[340px] sm:w-[410px] rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-800 p-4 shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Header / Active User Card */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-zinc-50 to-emerald-50/40 dark:from-zinc-800/70 dark:to-emerald-950/20 border border-zinc-200/70 dark:border-zinc-700/60 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${currentUser.color}`}
                  >
                    {currentUser.initials}
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ${getStatusDot(
                      currentUser.status
                    )}`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {currentUser.name}
                    </h4>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getRoleBadgeStyle(
                        currentUser.role
                      )}`}
                    >
                      {getDisplayRoleName(currentUser.role)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3 opacity-70" />
                    {currentUser.email}
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

            {/* User count info */}
            <div className="mt-2.5 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-700/50 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                Active Session
              </span>
              <span className="bg-zinc-200/60 dark:bg-zinc-700/60 px-2 py-0.5 rounded-md text-[10px] text-zinc-600 dark:text-zinc-300">
                {users.length} {users.length === 1 ? "User" : "Users"}
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl mb-3 border border-zinc-200/60 dark:border-zinc-700/50 text-xs font-medium">
            <button
              onClick={() => setActiveTab("team")}
              className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "team"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Team ({users.length})
            </button>
            <button
              onClick={() => setActiveTab("roles")}
              className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "roles"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Roles & Access
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "activity"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Activity Log {activities.length > 0 && `(${activities.length})`}
            </button>
          </div>

          {/* TAB 1: Team & Users List */}
          {activeTab === "team" && (
            <div className="space-y-2.5">
              {/* Search & Filter Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search user or role..."
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
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="py-1.5 px-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-xs outline-none text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="agronomist">Agronomist</option>
                  <option value="operator">Operator</option>
                  <option value="viewer">Observer</option>
                </select>
              </div>

              {/* User List Scrollable Area */}
              <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-0.5">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-6 text-zinc-400 text-xs">
                    No matching users found.
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelectedAsActive = user.id === activeUserId;
                    return (
                      <div
                        key={user.id}
                        className={`group flex items-center justify-between p-2 rounded-xl border transition-all ${
                          isSelectedAsActive
                            ? "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 shadow-xs"
                            : "bg-white dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Avatar */}
                          <div className="relative shrink-0">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-xs ${user.color}`}
                            >
                              {user.initials}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${getStatusDot(
                                user.status
                              )}`}
                            />
                          </div>

                          {/* Info */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">
                                {user.name}
                              </span>
                              {isSelectedAsActive && (
                                <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 dark:text-emerald-300 px-1.5 py-0.2 rounded">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.2 rounded border ${getRoleBadgeStyle(
                                  user.role
                                )}`}
                              >
                                {getDisplayRoleName(user.role)}
                              </span>
                              <span className="truncate text-[10px] text-zinc-400">
                                {user.assignedFieldIds.includes("all")
                                  ? "All Fields"
                                  : `${user.assignedFieldIds.length} ${
                                      user.assignedFieldIds.length === 1 ? "Field" : "Fields"
                                    }`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {!isSelectedAsActive && (
                            <button
                              onClick={() => {
                                setActiveUserId(user.id);
                                onActiveUserChange?.(user.name);
                                showToast(`Switched active session to "${user.name}".`);
                              }}
                              className="px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md transition-colors cursor-pointer"
                              title="Sign in as this user (Test)"
                            >
                              Switch
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 rounded-md transition-colors cursor-pointer"
                            title="Edit / Permissions"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Action: Add User Button */}
              <button
                onClick={() => setActiveModal("add")}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add New User / Team Member</span>
              </button>
            </div>
          )}

          {/* TAB 2: Roles & Permissions Info */}
          {activeTab === "roles" && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
              <div className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    System Administrator (Admin)
                  </span>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full">
                    Full Access
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Full control to draw and manage field boundaries, add/remove groups, invite team members, and configure system preferences.
                </p>
              </div>

              <div className="p-2.5 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/40 dark:bg-sky-950/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    Agronomist
                  </span>
                  <span className="text-[10px] bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-semibold px-2 py-0.5 rounded-full">
                    Planning & Analysis
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Creates and manages irrigation, fertilization, and spraying logs. Analyzes local weather trends and crop health parameters.
                </p>
              </div>

              <div className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Field & Equipment Operator
                  </span>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-full">
                    Field Tasks
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Performs and marks daily operations in assigned fields, logs fieldwork progress, and inputs rapid operational telemetry.
                </p>
              </div>

              <div className="p-2.5 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Field Observer
                  </span>
                  <span className="text-[10px] bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold px-2 py-0.5 rounded-full">
                    Read Only
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Can only view field polygons, status cards, and live metrics. Restricted from editing, creating, or deleting records.
                </p>
              </div>
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
                    No activity recorded yet. Actions like adding fields or users will appear here.
                  </div>
                ) : (
                  activities.map((act) => {
                    const { icon: Icon, color } = getActivityIconAndColor(act.type);
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

          {/* Toast Notification inside dropdown */}
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

      {/* MODAL 1: Add New User Dialog */}
      <Dialog open={activeModal === "add"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-[460px] p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              Add New User & Team Member
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Create a new user to manage your fields and team operations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddUserSubmit} className="space-y-4 mt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Full Name</Label>
              <Input
                required
                placeholder="e.g. Alex Johnson"
                value={newUserForm.name}
                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Email Address</Label>
                <Input
                  required
                  type="email"
                  placeholder="alex@example.com"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Phone Number</Label>
                <Input
                  placeholder="+1 (555) 000-0000"
                  value={newUserForm.phone}
                  onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">User Role</Label>
                <select
                  value={newUserForm.role}
                  onChange={(e) =>
                    setNewUserForm({
                      ...newUserForm,
                      role: e.target.value as "admin" | "agronomist" | "operator" | "viewer",
                    })
                  }
                  className="w-full h-9 px-2.5 bg-background border border-input rounded-md text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="admin">System Administrator (Admin)</option>
                  <option value="agronomist">Agronomist</option>
                  <option value="operator">Field & Equipment Operator</option>
                  <option value="viewer">Field Observer</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Initial Status</Label>
                <select
                  value={newUserForm.status}
                  onChange={(e) =>
                    setNewUserForm({
                      ...newUserForm,
                      status: e.target.value as "online" | "in_field" | "on_leave" | "offline",
                    })
                  }
                  className="w-full h-9 px-2.5 bg-background border border-input rounded-md text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="online">Online</option>
                  <option value="in_field">In Field / Inspection</option>
                  <option value="on_leave">On Leave</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>

            {/* Field Assignment */}
            <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Assigned Fields</Label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUserForm.allFields}
                    onChange={(e) =>
                      setNewUserForm({
                        ...newUserForm,
                        allFields: e.target.checked,
                        assignedFieldIds: e.target.checked
                          ? ["all"]
                          : fields.map((f) => f.id),
                      })
                    }
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  Grant Access to All Fields
                </label>
              </div>

              {!newUserForm.allFields && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
                  {fields.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">No fields added to the map yet.</p>
                  ) : (
                    fields.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={newUserForm.assignedFieldIds.includes(f.id)}
                          onChange={(e) => {
                            const current = newUserForm.assignedFieldIds;
                            const updated = e.target.checked
                              ? [...current, f.id]
                              : current.filter((id) => id !== f.id);
                            setNewUserForm({ ...newUserForm, assignedFieldIds: updated });
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{f.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Notice */}
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-start gap-2 text-[11px] text-emerald-800 dark:text-emerald-300">
              <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                This user is saved in your local workspace and can be managed across your sessions.
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveModal(null)}
                className="h-9 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
              >
                Save User
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Edit User Dialog */}
      <Dialog open={activeModal === "edit"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-[460px] p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base font-bold text-zinc-900 dark:text-zinc-100">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-emerald-600" />
                Edit User
              </div>
              {selectedUser && selectedUser.id !== "u1" && (
                <button
                  type="button"
                  onClick={() => handleDeleteUser(selectedUser.id)}
                  className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 p-1 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Update role, status, and assigned field permissions for {selectedUser?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditUserSubmit} className="space-y-4 mt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Full Name</Label>
              <Input
                required
                value={editUserForm.name}
                onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Email Address</Label>
                <Input
                  required
                  type="email"
                  value={editUserForm.email}
                  onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Phone Number</Label>
                <Input
                  value={editUserForm.phone}
                  onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">User Role</Label>
                <select
                  value={editUserForm.role}
                  onChange={(e) =>
                    setEditUserForm({
                      ...editUserForm,
                      role: e.target.value as "admin" | "agronomist" | "operator" | "viewer",
                    })
                  }
                  className="w-full h-9 px-2.5 bg-background border border-input rounded-md text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="admin">System Administrator (Admin)</option>
                  <option value="agronomist">Agronomist</option>
                  <option value="operator">Field & Equipment Operator</option>
                  <option value="viewer">Field Observer</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Status</Label>
                <select
                  value={editUserForm.status}
                  onChange={(e) =>
                    setEditUserForm({
                      ...editUserForm,
                      status: e.target.value as "online" | "in_field" | "on_leave" | "offline",
                    })
                  }
                  className="w-full h-9 px-2.5 bg-background border border-input rounded-md text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="online">Online</option>
                  <option value="in_field">In Field / Inspection</option>
                  <option value="on_leave">On Leave</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>

            {/* Field Assignment */}
            <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Assigned Fields</Label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editUserForm.allFields}
                    onChange={(e) =>
                      setEditUserForm({
                        ...editUserForm,
                        allFields: e.target.checked,
                        assignedFieldIds: e.target.checked
                          ? ["all"]
                          : fields.map((f) => f.id),
                      })
                    }
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  Grant Access to All Fields
                </label>
              </div>

              {!editUserForm.allFields && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
                  {fields.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">No fields added to the map yet.</p>
                  ) : (
                    fields.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editUserForm.assignedFieldIds.includes(f.id)}
                          onChange={(e) => {
                            const current = editUserForm.assignedFieldIds;
                            const updated = e.target.checked
                              ? [...current, f.id]
                              : current.filter((id) => id !== f.id);
                            setEditUserForm({ ...editUserForm, assignedFieldIds: updated });
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{f.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveModal(null)}
                className="h-9 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
