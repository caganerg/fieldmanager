"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
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
  Info,
  ChevronRight,
  GripVertical,
  Pin,
  PinOff
} from "lucide-react";
import { t } from "@/lib/translations";
import { type FieldPolygon } from "@/components/Map";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import { getPolygonCenter } from "@/lib/geo";
import { useAssistant } from "@/components/AssistantProvider";

// The weather panel and the four module dialogs are the bulk of what this
// header pulls in, and none of them is on screen when the page loads. Split out,
// each arrives the first time somebody opens it.
const WeatherDashboard = dynamic(() => import("@/components/WeatherDashboard"));
const IrrigationDialog = dynamic(() => import("@/components/IrrigationDialog"));
const ProtectionDialog = dynamic(() => import("@/components/ProtectionDialog"));
const FertilizerDialog = dynamic(() => import("@/components/FertilizerDialog"));
const SoilAnalysisDialog = dynamic(() => import("@/components/SoilAnalysisDialog"));
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PINNED_STORAGE_KEY = "fieldmanager-pinned-tools";

// Payload type for tool drags. Checking for it in dragover lets the panel
// ignore unrelated drags (files, selected text, the sidebar's field rows)
// instead of lighting up as a drop target for them.
const DRAG_MIME = "application/x-fieldmanager-tool";

// Weather sits on the panel out of the box; everything else starts inside the
// Tools folder. Either can be moved the other way.
const DEFAULT_PINNED = ["weather"];

// Defined at module scope: it depends only on the static translation table, so
// rebuilding it on every render just churned the array identity for no reason.
const TOOL_ITEMS = [
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
    status: t.activeStatus,
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
    badgeColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    status: t.activeStatus,
  },
  {
    id: "soil",
    title: t.featureSoilAnalysis,
    short: t.featureSoilAnalysisShort,
    desc: t.featureSoilAnalysisDesc,
    icon: Activity,
    accent: "text-emerald-500 dark:text-emerald-400",
    color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/80 hover:border-emerald-400",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    status: t.activeStatus,
  },
  {
    id: "assistant",
    title: t.featureAssistant,
    short: t.featureAssistantShort,
    desc: t.featureAssistantDesc,
    icon: Sparkles,
    accent: "text-violet-500 dark:text-violet-400",
    color: "text-violet-500 bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-800/80 hover:border-violet-400",
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
    status: t.activeStatus,
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
] as const;

type ToolItem = (typeof TOOL_ITEMS)[number];

const TOOL_IDS = new Set<string>(TOOL_ITEMS.map((item) => item.id));

// Modules with a real screen of their own. Everything else falls through to the
// placeholder dialog, so adding a module here is what retires its placeholder.
const MODULES_WITH_OWN_DIALOG = new Set(["irrigation", "fertilizer", "pesticide", "soil"]);

// A stored layout can outlive the tool list it was written for. Drop ids that
// no longer exist and collapse duplicates, which would otherwise render two
// buttons sharing a React key.
function sanitizePinned(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_PINNED;
  const result: string[] = [];
  for (const id of value) {
    if (typeof id === "string" && TOOL_IDS.has(id) && !result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}

interface ToolsBarProps {
  fields: FieldPolygon[];
  selectedFieldId: string | null;
}

export default function ToolsBar({
  fields,
  selectedFieldId,
}: ToolsBarProps) {
  // The Tools folder and the weather popover are both header popovers anchored a
  // few pixels apart. They used to be independent booleans, so both could be up
  // at once and overlap each other; one slot makes them mutually exclusive.
  const [openPanel, setOpenPanel] = useState<"tools" | "weather" | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  // Which module dialogs have been opened at least once. `next/dynamic` fetches
  // a component the moment it is first rendered, so mounting all four at
  // `open={false}` — as this did before they were split out — would pull them in
  // on page load and the split would buy nothing. Once opened, a dialog stays
  // mounted, so closing it still animates and its form is where it was left.
  const [openedModals, setOpenedModals] = useState<string[]>([]);
  const { openAssistant } = useAssistant();
  const isOpen = openPanel === "tools";
  const isWeatherOpen = openPanel === "weather";

  // Ids currently pinned to the header panel, in the order they appear there.
  // Starts at the default so the server and the first client render agree; the
  // stored layout is applied after mount.
  const [pinnedIds, setPinnedIds] = useState<string[]>(DEFAULT_PINNED);
  const [pinnedLoaded, setPinnedLoaded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Index in the pinned strip that the dragged tool would land on, so the strip
  // can show where the drop will put it.
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PINNED_STORAGE_KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPinnedIds(sanitizePinned(JSON.parse(saved)));
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

  // One handler for whichever popover is up. Both live inside `rootRef`, so a
  // click anywhere else — including on the other trigger — dismisses it. The
  // old pair of handlers treated the Tools folder as "inside" the weather
  // popover, which is why clicking Tools left the weather panel hanging open.
  useEffect(() => {
    if (openPanel === null) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPanel(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPanel(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  const pinnedItems = pinnedIds
    .map((id) => TOOL_ITEMS.find((item) => item.id === id))
    .filter((item): item is ToolItem => Boolean(item));
  const menuItems = TOOL_ITEMS.filter((item) => !pinnedIds.includes(item.id));

  const handleToolClick = (id: string) => {
    if (id === "weather") {
      setOpenPanel((panel) => (panel === "weather" ? null : "weather"));
      return;
    }
    setOpenPanel(null);
    // The assistant is not one of the tool modals: it is owned by
    // AssistantProvider so the same conversation is reachable from the modules
    // too, and this is just another way in.
    if (id === "assistant") {
      const field = fields.find((f) => f.id === selectedFieldId);
      openAssistant({ topic: "general", fieldId: field?.id ?? "", fieldName: field?.name ?? "" });
      return;
    }
    setOpenedModals((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveModal(id);
  };

  const pinTool = (id: string) => {
    if (!TOOL_IDS.has(id)) return;
    setPinnedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const unpinTool = (id: string) => {
    if (!TOOL_IDS.has(id)) return;
    setPinnedIds((prev) => prev.filter((pinned) => pinned !== id));
    if (id === "weather") setOpenPanel((panel) => (panel === "weather" ? null : panel));
  };

  const endDrag = useCallback(() => {
    setDraggingId(null);
    setDropIndex(null);
  }, []);

  const handleDragStart = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData(DRAG_MIME, id);
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  };

  // Only claim drags that carry a tool, so dropping a file or a selection on
  // the header doesn't light the panel up. `getData` is unreadable during
  // dragover, hence the custom MIME type in `types`; `draggingId` covers the
  // browsers that hide custom types until the drop.
  const isToolDrag = (event: React.DragEvent) =>
    draggingId !== null || event.dataTransfer.types.includes(DRAG_MIME);

  const allowDrop = (event: React.DragEvent) => {
    if (!isToolDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const readToolId = (event: React.DragEvent): string | null => {
    const id =
      event.dataTransfer.getData(DRAG_MIME) ||
      event.dataTransfer.getData("text/plain") ||
      draggingId ||
      "";
    return TOOL_IDS.has(id) ? id : null;
  };

  // Dropping on the strip both pins and reorders: `index` is the slot the tool
  // lands in, counted against the strip as currently drawn. Previously a drop
  // only ever appended, so dragging a pinned tool within the strip highlighted
  // the whole panel and then did nothing.
  const handleDropOnPanel = (event: React.DragEvent, index?: number) => {
    if (!isToolDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const id = readToolId(event);
    if (id) {
      setPinnedIds((prev) => {
        const from = prev.indexOf(id);
        const without = prev.filter((pinned) => pinned !== id);
        let target = index ?? without.length;
        // Pulling the tool out of the strip shifts every later slot left by one.
        if (from !== -1 && from < target) target -= 1;
        target = Math.max(0, Math.min(target, without.length));
        return [...without.slice(0, target), id, ...without.slice(target)];
      });
    }
    endDrag();
  };

  const handleDropOnTools = (event: React.DragEvent) => {
    if (!isToolDrag(event)) return;
    event.preventDefault();
    const id = readToolId(event);
    if (id) unpinTool(id);
    endDrag();
  };

  // Drops before or after the hovered button depending on which half the
  // pointer is over, the same convention as the sidebar's field list.
  const handleDragOverPinned = (event: React.DragEvent, index: number) => {
    if (!isToolDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDropIndex(event.clientX < rect.left + rect.width / 2 ? index : index + 1);
  };

  const weatherField = fields.find((field) => field.id === selectedFieldId);
  const weatherCenter =
    (weatherField ? getPolygonCenter(weatherField.coordinates) : null) ?? DEFAULT_CENTER;

  // Anchored to the right edge of its trigger. Anchoring left pushed a 360px
  // panel off the right side of the window, since every trigger sits in the
  // right-hand cluster of the header.
  const weatherPopover = (
    <div className="absolute top-full right-0 mt-2 z-50 w-[360px] max-w-[calc(100vw-2rem)]">
      <WeatherDashboard
        lat={weatherCenter[0]}
        lon={weatherCenter[1]}
        locationLabel={weatherField ? weatherField.name : t.weatherMapCenter}
      />
    </div>
  );

  const isDraggingPinned = draggingId !== null && pinnedIds.includes(draggingId);

  // Marks the gap the dragged tool would drop into.
  const dropMarker = (index: number) =>
    draggingId !== null && dropIndex === index ? (
      <span
        aria-hidden
        className="w-0.5 self-stretch my-0.5 rounded-full bg-emerald-500 dark:bg-emerald-400"
      />
    ) : null;

  return (
    <div ref={rootRef} className="flex items-center gap-2">
      {/* Pinned strip. Also the drop target that pins a tool, so it appears
          empty-but-outlined while something is being dragged. */}
      {(pinnedItems.length > 0 || draggingId) && (
        <div
          onDragOver={(event) => {
            if (!isToolDrag(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            // Past the last button, so the drop appends.
            setDropIndex(pinnedItems.length);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropIndex(null);
            }
          }}
          onDrop={(event) => handleDropOnPanel(event, dropIndex ?? undefined)}
          className={`flex items-center gap-2 rounded-lg transition-all ${
            draggingId
              ? "border-2 border-dashed border-emerald-400 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 px-2 py-1"
              : ""
          }`}
        >
          {pinnedItems.map((item, index) => {
            const Icon = item.icon;
            const isWeather = item.id === "weather";
            const isActive = isWeather ? isWeatherOpen : activeModal === item.id;
            return (
              <div
                key={item.id}
                className="relative flex items-center gap-2"
                onDragOver={(event) => handleDragOverPinned(event, index)}
                onDrop={(event) => handleDropOnPanel(event, dropIndex ?? index)}
              >
                {dropMarker(index)}
                <div
                  className={`group/pin relative flex items-center rounded-lg border shadow-xs transition-all ${
                    draggingId === item.id ? "opacity-40" : ""
                  } ${
                    isActive
                      ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-700"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
                  }`}
                >
                  <button
                    draggable
                    onDragStart={(event) => handleDragStart(event, item.id)}
                    onDragEnd={endDrag}
                    onClick={() => handleToolClick(item.id)}
                    title={`${item.title} — ${t.dragToTools}`}
                    aria-haspopup={isWeather ? "dialog" : undefined}
                    aria-expanded={isWeather ? isWeatherOpen : undefined}
                    className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-l-lg text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
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
                  {/* Drag-and-drop is the nicer gesture but it does not exist on
                      touch, so unpinning also has a real button. */}
                  <button
                    type="button"
                    onClick={() => unpinTool(item.id)}
                    title={t.unpinFromPanel}
                    aria-label={`${item.title} — ${t.unpinFromPanel}`}
                    className="pr-2 pl-0.5 py-1.5 rounded-r-lg text-zinc-300 dark:text-zinc-600 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover/pin:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                  >
                    <PinOff className="w-3.5 h-3.5" />
                  </button>
                </div>
                {index === pinnedItems.length - 1 && dropMarker(index + 1)}
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
        onDragOver={allowDrop}
        onDrop={handleDropOnTools}
      >
        {/* Trigger Button */}
        <button
          onClick={() => setOpenPanel((panel) => (panel === "tools" ? null : "tools"))}
          aria-haspopup="menu"
          aria-expanded={isOpen}
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
                onClick={() => setOpenPanel(null)}
                aria-label={t.closeBtn}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
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
                    onDragEnd={endDrag}
                    className={`group flex items-start gap-3 p-2.5 rounded-xl border transition-all ${item.color} bg-opacity-40 hover:bg-opacity-80 ${
                      draggingId === item.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 shadow-xs mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    {/* A real button, so the row is reachable by keyboard and
                        announced as an action rather than as plain text. */}
                    <button
                      type="button"
                      onClick={() => handleToolClick(item.id)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <span className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                          {item.title}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${item.badgeColor}`}>
                          {item.status}
                        </span>
                      </span>
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                        {item.desc}
                      </span>
                    </button>
                    <GripVertical className="w-3.5 h-3.5 text-zinc-400 self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                    <button
                      type="button"
                      onClick={() => pinTool(item.id)}
                      title={t.pinToPanel}
                      aria-label={`${item.title} — ${t.pinToPanel}`}
                      className="self-center p-1 rounded-md text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white/70 dark:hover:bg-zinc-900/70 transition-colors cursor-pointer"
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
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
      
      {/* 1. Irrigation */}
      {openedModals.includes("irrigation") && (
        <IrrigationDialog
          open={activeModal === "irrigation"}
          onOpenChange={(open) => !open && setActiveModal(null)}
          fields={fields}
          selectedFieldId={selectedFieldId}
        />
      )}

      {/* 2. Fertilization */}
      {openedModals.includes("fertilizer") && (
        <FertilizerDialog
          open={activeModal === "fertilizer"}
          onOpenChange={(open) => !open && setActiveModal(null)}
          fields={fields}
          selectedFieldId={selectedFieldId}
        />
      )}

      {/* 3. Crop Protection. The tool id stays "pesticide": it is what stored
          pinned layouts hold, and an unknown id is dropped from them. */}
      {openedModals.includes("pesticide") && (
        <ProtectionDialog
          open={activeModal === "pesticide"}
          onOpenChange={(open) => !open && setActiveModal(null)}
          fields={fields}
          selectedFieldId={selectedFieldId}
        />
      )}

      {/* 4. Soil Analysis */}
      {openedModals.includes("soil") && (
        <SoilAnalysisDialog
          open={activeModal === "soil"}
          onOpenChange={(open) => !open && setActiveModal(null)}
          fields={fields}
          selectedFieldId={selectedFieldId}
        />
      )}

      {/* 4. General Extensible Modal for the modules that have no screen yet */}
      <Dialog
        open={Boolean(activeModal && !MODULES_WITH_OWN_DIALOG.has(activeModal))}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              {activeModal ? TOOL_ITEMS.find(f => f.id === activeModal)?.title : t.featureModalTitle}
            </DialogTitle>
            <DialogDescription>
              {activeModal ? TOOL_ITEMS.find(f => f.id === activeModal)?.desc : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
                <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                  {t.logModuleReady}
                </p>
                <p>
                  {t.featureModalPlaceholder}
                </p>
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border text-xs text-zinc-500 space-y-2">
              <div className="flex justify-between">
                <span>{t.logStatusLabel}</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t.inDevelopment}</span>
              </div>
              <div className="flex justify-between">
                <span>{t.logTotalFieldsLabel}</span>
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
    </div>
  );
}
