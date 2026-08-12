"use client";

import { useState, useRef, useEffect } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
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

interface UsersMenuProps {
  fields?: FieldPolygon[];
}

export default function UsersMenu({ fields = [] }: UsersMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"team" | "roles" | "activity">("team");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeModal, setActiveModal] = useState<"add" | "edit" | "profile" | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserMember | null>(null);
  const [activeUserId, setActiveUserId] = useState<string>("u1");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Initial mock users
  const [users, setUsers] = useState<UserMember[]>([
    {
      id: "u1",
      name: "Çağan Ergün",
      email: "cagan@fieldmanager.local",
      phone: "+90 (555) 012 34 56",
      role: "admin",
      roleTitle: "Sistem Yöneticisi (Admin)",
      initials: "ÇE",
      status: "online",
      statusText: "Çevrimiçi",
      assignedFieldIds: ["all"],
      joinedDate: "10.01.2026",
      lastActive: "Şimdi aktif",
      color: "bg-emerald-600 text-white",
    },
    {
      id: "u2",
      name: "Mehmet Demir",
      email: "mehmet.demir@fieldmanager.local",
      phone: "+90 (555) 234 56 78",
      role: "agronomist",
      roleTitle: "Ziraat Mühendisi",
      initials: "MD",
      status: "in_field",
      statusText: "Sahada / İncelemede",
      assignedFieldIds: fields.slice(0, 2).map((f) => f.id),
      joinedDate: "15.02.2026",
      lastActive: "15 dk önce",
      color: "bg-sky-600 text-white",
    },
    {
      id: "u3",
      name: "Ayşe Kaya",
      email: "ayse.kaya@fieldmanager.local",
      phone: "+90 (555) 345 67 89",
      role: "operator",
      roleTitle: "Saha & Ekipman Operatörü",
      initials: "AK",
      status: "online",
      statusText: "Çevrimiçi",
      assignedFieldIds: ["all"],
      joinedDate: "01.03.2026",
      lastActive: "2 saat önce",
      color: "bg-amber-600 text-white",
    },
    {
      id: "u4",
      name: "Ali Yıldız",
      email: "ali.yildiz@fieldmanager.local",
      phone: "+90 (555) 456 78 90",
      role: "viewer",
      roleTitle: "Saha Gözlemcisi",
      initials: "AY",
      status: "offline",
      statusText: "Çevrimdışı",
      assignedFieldIds: [],
      joinedDate: "12.04.2026",
      lastActive: "Dün",
      color: "bg-purple-600 text-white",
    },
  ]);

  // Mock activity logs
  const [activities] = useState([
    {
      id: "act-1",
      user: "Çağan Ergün",
      action: "Sistem ayarlarını ve harita katmanlarını güncelledi",
      time: "10 dk önce",
      icon: ShieldCheck,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
      id: "act-2",
      user: "Mehmet Demir",
      action: "Kuzey Parseli için sulama planı kaydetti",
      time: "45 dk önce",
      icon: MapPin,
      color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40",
    },
    {
      id: "act-3",
      user: "Ayşe Kaya",
      action: "Gübreleme uygulaması görevini tamamladı",
      time: "2 saat önce",
      icon: CheckCircle2,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
    },
  ]);

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
      admin: "Sistem Yöneticisi (Admin)",
      agronomist: "Ziraat Mühendisi",
      operator: "Saha & Ekipman Operatörü",
      viewer: "Saha Gözlemcisi",
    };

    const colors: Record<string, string> = {
      admin: "bg-emerald-600 text-white",
      agronomist: "bg-sky-600 text-white",
      operator: "bg-amber-600 text-white",
      viewer: "bg-purple-600 text-white",
    };

    const statusTexts: Record<string, string> = {
      online: "Çevrimiçi",
      in_field: "Sahada / İncelemede",
      on_leave: "İzinli",
      offline: "Çevrimdışı",
    };

    const newUser: UserMember = {
      id: "u_" + Math.random().toString(36).substr(2, 7),
      name: newUserForm.name.trim(),
      email: newUserForm.email.trim(),
      phone: newUserForm.phone.trim() || "+90 (555) 000 00 00",
      role: newUserForm.role,
      roleTitle: roleTitles[newUserForm.role],
      initials,
      status: newUserForm.status,
      statusText: statusTexts[newUserForm.status],
      assignedFieldIds: newUserForm.allFields ? ["all"] : newUserForm.assignedFieldIds,
      joinedDate: new Date().toLocaleDateString("tr-TR"),
      lastActive: "Yeni eklendi",
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
    showToast(`"${newUser.name}" başarıyla eklendi! (Şablon)`);
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
      admin: "Sistem Yöneticisi (Admin)",
      agronomist: "Ziraat Mühendisi",
      operator: "Saha & Ekipman Operatörü",
      viewer: "Saha Gözlemcisi",
    };

    const statusTexts: Record<string, string> = {
      online: "Çevrimiçi",
      in_field: "Sahada / İncelemede",
      on_leave: "İzinli",
      offline: "Çevrimdışı",
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
    showToast("Kullanıcı bilgileri güncellendi!");
  };

  const handleDeleteUser = (id: string) => {
    if (id === "u1") {
      alert("Ana yönetici hesabı silinemez.");
      return;
    }
    const target = users.find((u) => u.id === id);
    setUsers(users.filter((u) => u.id !== id));
    if (activeUserId === id) {
      setActiveUserId("u1");
    }
    setActiveModal(null);
    showToast(`"${target?.name}" kaldırıldı.`);
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
        title="Kullanıcılar ve Ekip Yönetimi (Şablon)"
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
            {currentUser.roleTitle.split(" ")[0]}
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
                      {currentUser.role === "admin"
                        ? "Yönetici"
                        : currentUser.role === "agronomist"
                        ? "Mühendis"
                        : currentUser.role === "operator"
                        ? "Operatör"
                        : "Gözlemci"}
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
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mock Template Notice */}
            <div className="mt-2.5 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-700/50 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                Şablon Kullanıcı Modu
              </span>
              <span className="bg-zinc-200/60 dark:bg-zinc-700/60 px-2 py-0.5 rounded-md text-[10px] text-zinc-600 dark:text-zinc-300">
                {users.length} Kayıtlı Kullanıcı
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
              Kullanıcılar ({users.length})
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
              Roller & Yetkiler
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
              Aktiviteler
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
                    placeholder="Kullanıcı veya rol ara..."
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
                  <option value="all">Tüm Roller</option>
                  <option value="admin">Yönetici</option>
                  <option value="agronomist">Ziraat Müh.</option>
                  <option value="operator">Operatör</option>
                  <option value="viewer">Gözlemci</option>
                </select>
              </div>

              {/* User List Scrollable Area */}
              <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-0.5">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-6 text-zinc-400 text-xs">
                    Eşleşen kullanıcı bulunamadı.
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
                                  Aktif
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.2 rounded border ${getRoleBadgeStyle(
                                  user.role
                                )}`}
                              >
                                {user.role === "admin"
                                  ? "Yönetici"
                                  : user.role === "agronomist"
                                  ? "Ziraat Müh."
                                  : user.role === "operator"
                                  ? "Operatör"
                                  : "Gözlemci"}
                              </span>
                              <span className="truncate text-[10px] text-zinc-400">
                                {user.assignedFieldIds.includes("all")
                                  ? "Tüm Tarlalar"
                                  : `${user.assignedFieldIds.length} Tarla`}
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
                                showToast(`Aktif oturum "${user.name}" olarak değiştirildi.`);
                              }}
                              className="px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md transition-colors"
                              title="Bu kullanıcı olarak oturum aç (Test)"
                            >
                              Geç
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 rounded-md transition-colors"
                            title="Düzenle / Yetkiler"
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
                <span>Yeni Kullanıcı / Ekip Üyesi Ekle</span>
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
                    Sistem Yöneticisi (Admin)
                  </span>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full">
                    Tam Yetki
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Harita çizimi, tarla ve grup ekleme/silme, kullanıcı davet etme ve sistem ayarlarını yönetme yetkisine sahiptir.
                </p>
              </div>

              <div className="p-2.5 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/40 dark:bg-sky-950/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    Ziraat Mühendisi (Agronomist)
                  </span>
                  <span className="text-[10px] bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-semibold px-2 py-0.5 rounded-full">
                    Planlama & Analiz
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Sulama, gübreleme, ilaçlama kayıtları ekler, hava durumu ve ürün sağlığı raporlarını analiz eder.
                </p>
              </div>

              <div className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Saha & Ekipman Operatörü
                  </span>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-full">
                    Saha Görevleri
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Atanan tarlalardaki günlük operasyonları tamamlar, pratik veri ve sulama girişleri yapar.
                </p>
              </div>

              <div className="p-2.5 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Saha Gözlemcisi (Observer)
                  </span>
                  <span className="text-[10px] bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold px-2 py-0.5 rounded-full">
                    Salt Okunur
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Sadece haritadaki tarlaları ve genel durumları görüntüler. Düzenleme veya silme yapamaz.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Activity Log */}
          {activeTab === "activity" && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
              {activities.map((act) => {
                const Icon = act.icon;
                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-2.5 p-2 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30"
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 ${act.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                          {act.user}
                        </span>
                        <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                          {act.time}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-snug">
                        {act.action}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Toast Notification inside dropdown */}
          {toastMessage && (
            <div className="mt-3 p-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[11px] font-medium rounded-lg flex items-center justify-between animate-in fade-in duration-150">
              <span>{toastMessage}</span>
              <button
                onClick={() => setToastMessage(null)}
                className="text-zinc-400 hover:text-white dark:hover:text-zinc-900"
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
              Yeni Kullanıcı & Ekip Üyesi Ekle
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Tarlanızı ve ekibinizi yönetmek için yeni bir kullanıcı şablonu oluşturun.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddUserSubmit} className="space-y-4 mt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Ad Soyad</Label>
              <Input
                required
                placeholder="Örn: Ahmet Yılmaz"
                value={newUserForm.name}
                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">E-Posta</Label>
                <Input
                  required
                  type="email"
                  placeholder="ahmet@example.com"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Telefon</Label>
                <Input
                  placeholder="+90 (555) 000 00 00"
                  value={newUserForm.phone}
                  onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Kullanıcı Rolü</Label>
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
                  <option value="admin">Sistem Yöneticisi (Admin)</option>
                  <option value="agronomist">Ziraat Mühendisi</option>
                  <option value="operator">Saha & Ekipman Operatörü</option>
                  <option value="viewer">Saha Gözlemcisi</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Başlangıç Durumu</Label>
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
                  <option value="online">Çevrimiçi</option>
                  <option value="in_field">Sahada / İncelemede</option>
                  <option value="on_leave">İzinli</option>
                  <option value="offline">Çevrimdışı</option>
                </select>
              </div>
            </div>

            {/* Field Assignment */}
            <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Yetkili Tarlalar</Label>
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
                  Tüm Tarlalara Yetki Ver
                </label>
              </div>

              {!newUserForm.allFields && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
                  {fields.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">Henüz haritaya tarla eklenmemiş.</p>
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
                Bu kullanıcı şablon olarak tarayıcı oturumunuza eklenir. İleride veritabanı veya kimlik doğrulama bağlandığında kalıcı olarak kaydedilecektir.
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveModal(null)}
                className="h-9 text-xs"
              >
                İptal
              </Button>
              <Button
                type="submit"
                className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                Kullanıcıyı Kaydet
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
                Kullanıcıyı Düzenle
              </div>
              {selectedUser && selectedUser.id !== "u1" && (
                <button
                  type="button"
                  onClick={() => handleDeleteUser(selectedUser.id)}
                  className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 p-1 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Sil
                </button>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              {selectedUser?.name} kullanıcısının rolünü, durumunu ve yetkili tarlalarını güncelleyin.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditUserSubmit} className="space-y-4 mt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Ad Soyad</Label>
              <Input
                required
                value={editUserForm.name}
                onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">E-Posta</Label>
                <Input
                  required
                  type="email"
                  value={editUserForm.email}
                  onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Telefon</Label>
                <Input
                  value={editUserForm.phone}
                  onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Kullanıcı Rolü</Label>
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
                  <option value="admin">Sistem Yöneticisi (Admin)</option>
                  <option value="agronomist">Ziraat Mühendisi</option>
                  <option value="operator">Saha & Ekipman Operatörü</option>
                  <option value="viewer">Saha Gözlemcisi</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Durum</Label>
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
                  <option value="online">Çevrimiçi</option>
                  <option value="in_field">Sahada / İncelemede</option>
                  <option value="on_leave">İzinli</option>
                  <option value="offline">Çevrimdışı</option>
                </select>
              </div>
            </div>

            {/* Field Assignment */}
            <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Yetkili Tarlalar</Label>
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
                  Tüm Tarlalara Yetki Ver
                </label>
              </div>

              {!editUserForm.allFields && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
                  {fields.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">Henüz haritaya tarla eklenmemiş.</p>
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
                className="h-9 text-xs"
              >
                İptal
              </Button>
              <Button
                type="submit"
                className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                Değişiklikleri Kaydet
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
