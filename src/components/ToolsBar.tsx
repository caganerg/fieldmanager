"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Droplets,
  FlaskConical,
  Bug,
  Activity,
  TrendingUp,
  CloudRain,
  ChevronDown,
  X,
  Layers,
  Plus,
  Info,
  ChevronRight,
  GripVertical
} from "lucide-react";
import { t } from "@/lib/translations";
import { type FieldPolygon } from "@/components/Map";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import { getPolygonCenter } from "@/lib/geo";
import WeatherDashboard from "@/components/WeatherDashboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const PINNED_STORAGE_KEY = "fieldmanager-pinned-tools";

// Weather sits on the panel out of the box; everything else starts inside the
// Tools folder. Either can be dragged the other way.
const DEFAULT_PINNED = ["weather"];

interface ToolsBarProps {
  fields: FieldPolygon[];
  selectedFieldId: string | null;
}

export default function ToolsBar({
  fields,
  selectedFieldId,
}: ToolsBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isWeatherOpen, setIsWeatherOpen] = useState(false);

  // Ids currently pinned to the header panel, in the order they appear there.
  // Starts at the default so the server and the first client render agree; the
  // stored layout is applied after mount.
  const [pinnedIds, setPinnedIds] = useState<string[]>(DEFAULT_PINNED);
  const [pinnedLoaded, setPinnedLoaded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const weatherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PINNED_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPinnedIds(parsed.filter((id): id is string => typeof id === "string"));
        }
      }
    } catch (e) {
      console.error("Error reading pinned tools:", e);
    }
    setPinnedLoaded(true);
  }, []);

  useEffect(() => {
    // Don't write the default over a stored layout before it has been read.
    if (!pinnedLoaded) return;
    try {
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinnedIds));
    } catch (e) {
      console.error("Error saving pinned tools:", e);
    }
  }, [pinnedIds, pinnedLoaded]);

  // Persistent state for irrigation and fertilizer entries
  const [irrigationLogs, setIrrigationLogs] = useState<Array<{ id: string; fieldName: string; date: string; amount: string; method: string }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("fieldmanager-irrigation-logs");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.error("Error reading irrigation logs:", e);
      }
    }
    return [];
  });

  const [fertilizerLogs, setFertilizerLogs] = useState<Array<{ id: string; fieldName: string; date: string; type: string; amount: string }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("fieldmanager-fertilizer-logs");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.error("Error reading fertilizer logs:", e);
      }
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("fieldmanager-irrigation-logs", JSON.stringify(irrigationLogs));
    } catch (e) {
      console.error("Error saving irrigation logs:", e);
    }
  }, [irrigationLogs]);

  useEffect(() => {
    try {
      localStorage.setItem("fieldmanager-fertilizer-logs", JSON.stringify(fertilizerLogs));
    } catch (e) {
      console.error("Error saving fertilizer logs:", e);
    }
  }, [fertilizerLogs]);

  const [newIrrigation, setNewIrrigation] = useState({
    fieldId: selectedFieldId || fields[0]?.id || "",
    amount: "20",
    method: "Drip Irrigation",
    date: new Date().toISOString().split("T")[0],
  });

  const [newFertilizer, setNewFertilizer] = useState({
    fieldId: selectedFieldId || fields[0]?.id || "",
    type: "Urea (46% N)",
    amount: "15",
    date: new Date().toISOString().split("T")[0],
  });

  // Close the Tools dropdown when clicking outside
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

  // Same for the weather popover, wherever it is currently anchored
  useEffect(() => {
    if (!isWeatherOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inWeather = weatherRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inWeather && !inMenu) setIsWeatherOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isWeatherOpen]);

  const toolItems = [
    {
      id: "weather",
      title: t.featureWeather,
      short: t.weatherTitle,
      desc: t.featureWeatherDesc,
      icon: CloudRain,
      accent: "text-blue-500 dark:text-blue-400",
      color: "text-blue-500 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/80 hover:border-blue-400",
      badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
      status: t.activeStatus,
    },
    {
      id: "irrigation",
      title: t.featureIrrigation,
      short: t.featureIrrigationShort,
      desc: t.featureIrrigationDesc,
      icon: Droplets,
      accent: "text-sky-500 dark:text-sky-400",
      color: "text-sky-500 bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800/80 hover:border-sky-400",
      badgeColor: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
      status: t.inDevelopment,
    },
    {
      id: "fertilizer",
      title: t.featureFertilizer,
      short: t.featureFertilizerShort,
      desc: t.featureFertilizerDesc,
      icon: FlaskConical,
      accent: "text-amber-500 dark:text-amber-400",
      color: "text-amber-500 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/80 hover:border-amber-400",
      badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
      status: t.inDevelopment,
    },
    {
      id: "pesticide",
      title: t.featurePesticide,
      short: t.featurePesticideShort,
      desc: t.featurePesticideDesc,
      icon: Bug,
      accent: "text-rose-500 dark:text-rose-400",
      color: "text-rose-500 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/80 hover:border-rose-400",
      badgeColor: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      status: t.comingSoon,
    },
    {
      id: "soil",
      title: t.featureSoilAnalysis,
      short: t.featureSoilAnalysisShort,
      desc: t.featureSoilAnalysisDesc,
      icon: Activity,
      accent: "text-emerald-500 dark:text-emerald-400",
      color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/80 hover:border-emerald-400",
      badgeColor: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      status: t.comingSoon,
    },
    {
      id: "yield",
      title: t.featureYield,
      short: t.featureYieldShort,
      desc: t.featureYieldDesc,
      icon: TrendingUp,
      accent: "text-purple-500 dark:text-purple-400",
      color: "text-purple-500 bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800/80 hover:border-purple-400",
      badgeColor: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      status: t.comingSoon,
    },
  ];

  const pinnedItems = pinnedIds
    .map((id) => toolItems.find((item) => item.id === id))
    .filter((item): item is (typeof toolItems)[number] => Boolean(item));
  const menuItems = toolItems.filter((item) => !pinnedIds.includes(item.id));

  const handleToolClick = (id: string) => {
    setIsOpen(false);
    if (id === "weather") {
      setIsWeatherOpen((open) => !open);
      return;
    }
    setActiveModal(id);
  };

  const handleDragStart = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  };

  const allowDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDropOnPanel = (event: React.DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id && toolItems.some((item) => item.id === id)) {
      setPinnedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    setDraggingId(null);
  };

  const handleDropOnTools = (event: React.DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) {
      setPinnedIds((prev) => prev.filter((pinned) => pinned !== id));
      if (id === "weather") setIsWeatherOpen(false);
    }
    setDraggingId(null);
  };

  const weatherField = fields.find((field) => field.id === selectedFieldId);
  const weatherCenter =
    (weatherField ? getPolygonCenter(weatherField.coordinates) : null) ?? DEFAULT_CENTER;

  const weatherPopover = (
    <div className="absolute top-full left-0 mt-2 z-50 w-[350px] max-w-[calc(100vw-2rem)]">
      <WeatherDashboard
        lat={weatherCenter[0]}
        lon={weatherCenter[1]}
        locationLabel={weatherField ? weatherField.name : t.weatherMapCenter}
      />
    </div>
  );

  const handleAddIrrigation = (e: React.FormEvent) => {
    e.preventDefault();
    const field = fields.find(f => f.id === newIrrigation.fieldId) || fields[0];
    const newLog = {
      id: Math.random().toString(36).substr(2, 9),
      fieldName: field ? field.name : "Selected Field",
      date: newIrrigation.date,
      amount: `${newIrrigation.amount} m³`,
      method: newIrrigation.method,
    };
    setIrrigationLogs([newLog, ...irrigationLogs]);
  };

  const handleAddFertilizer = (e: React.FormEvent) => {
    e.preventDefault();
    const field = fields.find(f => f.id === newFertilizer.fieldId) || fields[0];
    const newLog = {
      id: Math.random().toString(36).substr(2, 9),
      fieldName: field ? field.name : "Selected Field",
      date: newFertilizer.date,
      type: newFertilizer.type,
      amount: `${newFertilizer.amount} kg/da`,
    };
    setFertilizerLogs([newLog, ...fertilizerLogs]);
  };

  const isDraggingPinned = draggingId !== null && pinnedIds.includes(draggingId);

  return (
    <>
      {/* Pinned strip. Also the drop target that pins a tool, so it appears
          empty-but-outlined while something is being dragged. */}
      {(pinnedItems.length > 0 || draggingId) && (
        <div
          onDragOver={allowDrop}
          onDrop={handleDropOnPanel}
          className={`flex items-center gap-2 rounded-lg transition-all ${
            draggingId
              ? "border-2 border-dashed border-emerald-400 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 px-2 py-1"
              : ""
          }`}
        >
          {pinnedItems.map((item) => {
            const Icon = item.icon;
            const isWeather = item.id === "weather";
            const isActive = isWeather ? isWeatherOpen : activeModal === item.id;
            return (
              <div key={item.id} className="relative" ref={isWeather ? weatherRef : undefined}>
                <button
                  draggable
                  onDragStart={(event) => handleDragStart(event, item.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => handleToolClick(item.id)}
                  title={`${item.title} — ${t.dragToTools}`}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-xs cursor-pointer ${
                    draggingId === item.id ? "opacity-40" : ""
                  } ${
                    isActive
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-300"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 hover:border-zinc-300"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${item.accent}`} />
                  <span>{item.short}</span>
                  {isWeather && (
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isWeatherOpen ? "rotate-180" : ""}`}
                    />
                  )}
                </button>
                {isWeather && isWeatherOpen && weatherPopover}
              </div>
            );
          })}

          {pinnedItems.length === 0 && draggingId && (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 px-1 py-0.5">
              {t.dropToPin}
            </span>
          )}
        </div>
      )}

      {/* The Tools folder. Dropping a pinned tool anywhere on it puts it back. */}
      <div
        className="relative"
        ref={menuRef}
        onDragOver={allowDrop}
        onDrop={handleDropOnTools}
      >
        {/* Trigger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-xs cursor-pointer ${
            isDraggingPinned
              ? "border-2 border-dashed border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
              : isOpen
                ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-300"
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 hover:border-zinc-300"
          }`}
          title={t.featuresTitle}
        >
          <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{isDraggingPinned ? t.dropToTools : t.featuresBtn}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown Panel */}
        {isOpen && (
          <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 p-4 shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {t.featuresTitle}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t.dragToPanel}
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Feature Grid */}
            <div className="grid grid-cols-1 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(event) => handleDragStart(event, item.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => handleToolClick(item.id)}
                    className={`group flex items-start gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${item.color} bg-opacity-40 hover:bg-opacity-80 ${
                      draggingId === item.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 shadow-xs mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                          {item.title}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${item.badgeColor}`}>
                          {item.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                    <GripVertical className="w-3.5 h-3.5 text-zinc-400 self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 self-center opacity-60 group-hover:opacity-100 transition-opacity" />
                  </div>
                );
              })}

              {menuItems.length === 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center py-6 px-2">
                  {t.toolsAllPinned}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Weather lives here while it is inside the folder */}
        {isWeatherOpen && !pinnedIds.includes("weather") && weatherPopover}
      </div>

      {/* Feature Modals for Upcoming / Extensible Modules */}
      
      {/* 1. Irrigation Modal */}
      <Dialog open={activeModal === "irrigation"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <Droplets className="w-5 h-5" />
              {t.featureIrrigation}
            </DialogTitle>
            <DialogDescription>
              {t.featureIrrigationDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick Add Irrigation Log Form */}
            <form onSubmit={handleAddIrrigation} className="p-3.5 bg-sky-50/60 dark:bg-sky-950/30 rounded-xl border border-sky-100 dark:border-sky-900/50 space-y-3">
              <h4 className="text-xs font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wide flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add Irrigation Record
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    Field
                  </Label>
                  <select
                    className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-800 dark:text-zinc-200 outline-none"
                    value={newIrrigation.fieldId}
                    onChange={(e) => setNewIrrigation({ ...newIrrigation, fieldId: e.target.value })}
                  >
                    {fields.length === 0 ? (
                      <option value="">No Fields</option>
                    ) : (
                      fields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    Amount (m³ or Ton)
                  </Label>
                  <Input
                    className="h-8 text-xs bg-white dark:bg-zinc-900"
                    placeholder="25"
                    value={newIrrigation.amount}
                    onChange={(e) => setNewIrrigation({ ...newIrrigation, amount: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    Method
                  </Label>
                  <select
                    className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-800 dark:text-zinc-200 outline-none"
                    value={newIrrigation.method}
                    onChange={(e) => setNewIrrigation({ ...newIrrigation, method: e.target.value })}
                  >
                    <option value="Drip Irrigation">Drip Irrigation</option>
                    <option value="Sprinkler">Sprinkler</option>
                    <option value="Flood / Furrow">Flood / Furrow</option>
                    <option value="Center Pivot">Center Pivot</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    Date
                  </Label>
                  <Input
                    type="date"
                    className="h-8 text-xs bg-white dark:bg-zinc-900"
                    value={newIrrigation.date}
                    onChange={(e) => setNewIrrigation({ ...newIrrigation, date: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" className="w-full bg-sky-600 hover:bg-sky-700 text-white text-xs h-8">
                Save Record
              </Button>
            </form>

            {/* Recent Logs List */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Recent Irrigation Logs
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {irrigationLogs.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                    No irrigation records yet. Add one above.
                  </div>
                ) : (
                  irrigationLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-zinc-50/50 dark:bg-zinc-900/50 text-xs">
                      <div>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{log.fieldName}</span>
                        <span className="text-zinc-400 ml-2">({log.method})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-sky-600 dark:text-sky-400">{log.amount}</span>
                        <span className="text-zinc-400">{log.date}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. Fertilization Modal */}
      <Dialog open={activeModal === "fertilizer"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <FlaskConical className="w-5 h-5" />
              {t.featureFertilizer}
            </DialogTitle>
            <DialogDescription>
              {t.featureFertilizerDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick Add Fertilizer Form */}
            <form onSubmit={handleAddFertilizer} className="p-3.5 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900/50 space-y-3">
              <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add Fertilization Record
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    Field
                  </Label>
                  <select
                    className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-800 dark:text-zinc-200 outline-none"
                    value={newFertilizer.fieldId}
                    onChange={(e) => setNewFertilizer({ ...newFertilizer, fieldId: e.target.value })}
                  >
                    {fields.length === 0 ? (
                      <option value="">No Fields</option>
                    ) : (
                      fields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    Dosage (kg/da)
                  </Label>
                  <Input
                    className="h-8 text-xs bg-white dark:bg-zinc-900"
                    placeholder="15"
                    value={newFertilizer.amount}
                    onChange={(e) => setNewFertilizer({ ...newFertilizer, amount: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    Fertilizer Type
                  </Label>
                  <select
                    className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-800 dark:text-zinc-200 outline-none"
                    value={newFertilizer.type}
                    onChange={(e) => setNewFertilizer({ ...newFertilizer, type: e.target.value })}
                  >
                    <option value="Urea (46% N)">Urea (46% N)</option>
                    <option value="DAP (18-46-0)">DAP (18-46-0)</option>
                    <option value="NPK 15-15-15">NPK 15-15-15</option>
                    <option value="Ammonium Sulfate">Ammonium Sulfate</option>
                    <option value="Potassium Nitrate">Potassium Nitrate</option>
                    <option value="Liquid / Foliar Fertilizer">Liquid / Foliar Fertilizer</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    Application Date
                  </Label>
                  <Input
                    type="date"
                    className="h-8 text-xs bg-white dark:bg-zinc-900"
                    value={newFertilizer.date}
                    onChange={(e) => setNewFertilizer({ ...newFertilizer, date: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs h-8">
                Save Record
              </Button>
            </form>

            {/* Recent Logs List */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Recent Fertilization Logs
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {fertilizerLogs.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                    No fertilization records yet. Add one above.
                  </div>
                ) : (
                  fertilizerLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-zinc-50/50 dark:bg-zinc-900/50 text-xs">
                      <div>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{log.fieldName}</span>
                        <span className="text-zinc-400 ml-2">({log.type})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-amber-600 dark:text-amber-400">{log.amount}</span>
                        <span className="text-zinc-400">{log.date}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. General Extensible Modal for other features */}
      <Dialog
        open={Boolean(activeModal && activeModal !== "irrigation" && activeModal !== "fertilizer")}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              {activeModal ? toolItems.find(f => f.id === activeModal)?.title : t.featureModalTitle}
            </DialogTitle>
            <DialogDescription>
              {activeModal ? toolItems.find(f => f.id === activeModal)?.desc : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
                <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                  Module Infrastructure Ready
                </p>
                <p>
                  {t.featureModalPlaceholder}
                </p>
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border text-xs text-zinc-500 space-y-2">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t.inDevelopment}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Defined Fields:</span>
                <span className="font-semibold">{fields.length}</span>
              </div>
            </div>

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              onClick={() => setActiveModal(null)}
            >
              {t.closeBtn}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
