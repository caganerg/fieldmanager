"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

import { Trees, MapPin, Settings, Trash2, Edit2, ChevronRight, ChevronDown, Save, X, Plus, Folder, FolderOpen, GripVertical, Palette, Download, Upload, Info, Sun, Moon, Monitor, CloudRain } from "lucide-react";
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
import { type FieldPolygon } from "@/components/Map";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import type { LatLngTuple } from "leaflet";
import WeatherDashboard from "@/components/WeatherDashboard";
import FeaturesMenu from "@/components/FeaturesMenu";
import UsersMenu, { type ActivityItem } from "@/components/UsersMenu";
import { t } from "@/lib/translations";

// Dynamically import Map with SSR disabled since Leaflet requires window/document
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 bg-zinc-100 dark:bg-zinc-900 absolute inset-0">Loading map...</div>
});

// Calculate simple bounding box center for a polygon
function getPolygonCenter(coordinates: LatLngTuple[]): LatLngTuple | null {
  if (!coordinates || coordinates.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  coordinates.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}

// Calculate polygon area in square meters from LatLngTuple coordinates
// Uses the Shoelace formula on a spherical Earth approximation
function calculatePolygonArea(coordinates: LatLngTuple[]): number {
  if (coordinates.length < 3) return 0;

  const EARTH_RADIUS = 6371000; // meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  let area = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = toRad(coordinates[i][0]);
    const lng1 = toRad(coordinates[i][1]);
    const lat2 = toRad(coordinates[j][0]);
    const lng2 = toRad(coordinates[j][1]);

    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
  return area;
}

export default function Dashboard() {
  const [isMounted, setIsMounted] = useState(false);

  // App State
  const [fields, setFields] = useState<FieldPolygon[]>([]);
  const [groups, setGroups] = useState<{ id: string, name: string }[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [pendingCoordinates, setPendingCoordinates] = useState<LatLngTuple[] | null>(null);

  // Group State
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  // Drag and Drop State
  const [dragItem, setDragItem] = useState<{ type: 'group' | 'field', id: string } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ type: 'group' | 'field', id: string } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [newGroupName, setNewGroupName] = useState("");
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWeatherOpen, setIsWeatherOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);

  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  // User & Activity State
  const [activeUserName, setActiveUserName] = useState("Guest");
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    cropType: "",
    plantDate: "",
    harvestDate: "",
    groupId: "unassigned",
    color: ""
  });

  // Reference for hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    const savedTheme = localStorage.getItem('fieldmanager-theme') as 'light' | 'dark' | 'system' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
    // The weather key now lives only in the server environment. Drop any copy
    // left in this browser by an earlier version.
    localStorage.removeItem('fieldmanager-weather-api-key');

    // Load saved activities
    const savedActivities = localStorage.getItem('fieldmanager-activities');
    if (savedActivities) {
      try {
        const parsed = JSON.parse(savedActivities);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validActivities = parsed.filter(
            (a: ActivityItem) => a && typeof a.id === "string" && typeof a.action === "string"
          );
          if (validActivities.length > 0) {
            setActivities(validActivities);
          }
        } else {
          setActivities([
            {
              id: "act-init",
              user: "Guest",
              action: "Workspace initialized and ready",
              timestamp: Date.now() - 1000 * 60 * 5,
              type: "default",
            },
          ]);
        }
      } catch {
        // fallback
      }
    } else {
      setActivities([
        {
          id: "act-init",
          user: "Guest",
          action: "Workspace initialized and ready",
          timestamp: Date.now() - 1000 * 60 * 5,
          type: "default",
        },
      ]);
    }

    // Check if first visit for welcome modal
    const hasWelcomed = localStorage.getItem('fieldmanager-welcomed');
    if (!hasWelcomed) {
      setIsWelcomeOpen(true);
    }
  }, []);

  // Apply theme to <html> element
  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else if (theme === 'light') {
        root.classList.remove('dark');
      } else {
        // system
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    applyTheme();
    localStorage.setItem('fieldmanager-theme', theme);

    // Listen for system theme changes when in 'system' mode
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  const addActivity = useCallback((action: string, type: ActivityItem["type"] = "default") => {
    const newAct: ActivityItem = {
      id: "act-" + Math.random().toString(36).substr(2, 9),
      user: activeUserName,
      action,
      timestamp: Date.now(),
      type,
    };
    setActivities(prev => {
      const updated = [newAct, ...prev.slice(0, 49)];
      if (typeof window !== "undefined") {
        localStorage.setItem("fieldmanager-activities", JSON.stringify(updated));
      }
      return updated;
    });
  }, [activeUserName]);

  const clearActivities = useCallback(() => {
    setActivities([]);
    if (typeof window !== "undefined") {
      localStorage.setItem("fieldmanager-activities", JSON.stringify([]));
    }
  }, []);

  const handlePolygonCreated = (coordinates: LatLngTuple[]) => {
    // Once polygon is drawn, stop drawing mode and open the new field form
    setIsDrawingMode(false);
    setPendingCoordinates(coordinates);
    setSelectedFieldId(null);
    setSelectedGroupId(null);
    setFormData({
      name: `${t.fieldDefaultName} ${fields.length + 1}`,
      cropType: "",
      plantDate: "",
      harvestDate: "",
      groupId: selectedGroupId || "unassigned",
      color: ""
    });
  };

  const handleSaveField = () => {
    if (pendingCoordinates) {
      // Create new field
      const fieldName = formData.name || `${t.fieldDefaultName} ${fields.length + 1}`;
      const newField: FieldPolygon = {
        id: Math.random().toString(36).substr(2, 9),
        name: fieldName,
        coordinates: pendingCoordinates,
        cropType: formData.cropType,
        plantDate: formData.plantDate ? new Date(formData.plantDate) : undefined,
        harvestDate: formData.harvestDate ? new Date(formData.harvestDate) : undefined,
        groupId: formData.groupId === "unassigned" ? undefined : formData.groupId,
        color: formData.color || undefined
      };
      setFields([...fields, newField]);
      setPendingCoordinates(null);
      setSelectedFieldId(newField.id);
      addActivity(`Added new field "${newField.name}"${newField.cropType ? ` (${newField.cropType})` : ""}`, "field_add");
    } else if (selectedFieldId) {
      // Update existing field
      const prevField = fields.find(f => f.id === selectedFieldId);
      const updatedName = formData.name || prevField?.name || "Field";
      setFields(fields.map(f => f.id === selectedFieldId ? {
        ...f,
        name: formData.name,
        cropType: formData.cropType,
        plantDate: formData.plantDate ? new Date(formData.plantDate) : undefined,
        harvestDate: formData.harvestDate ? new Date(formData.harvestDate) : undefined,
        groupId: formData.groupId === "unassigned" ? undefined : formData.groupId,
        color: formData.color || undefined
      } : f));
      addActivity(`Updated field "${updatedName}"`, "field_edit");
    }
  };

  const handleCancelForm = () => {
    setPendingCoordinates(null);
    setSelectedFieldId(null);
  };

  const handleFieldSelect = (id: string) => {
    const field = fields.find(f => f.id === id);
    if (field) {
      setSelectedFieldId(id);
      setSelectedGroupId(null);
      setPendingCoordinates(null);
      setFormData({
        name: field.name,
        cropType: field.cropType || "",
        plantDate: field.plantDate ? field.plantDate.toISOString().split('T')[0] : "",
        harvestDate: field.harvestDate ? field.harvestDate.toISOString().split('T')[0] : "",
        groupId: field.groupId || "unassigned",
        color: field.color || ""
      });
    }
  };

  const handleDeleteField = (id: string) => {
    const targetField = fields.find(f => f.id === id);
    setFields(fields.filter(f => f.id !== id));
    if (selectedFieldId === id) {
      setSelectedFieldId(null);
    }
    addActivity(`Deleted field "${targetField?.name || id}"`, "field_delete");
  };

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      const groupName = newGroupName.trim();
      setGroups([...groups, {
        id: Math.random().toString(36).substr(2, 9),
        name: groupName
      }]);
      setNewGroupName("");
      setIsAddingGroup(false);
      addActivity(`Created group "${groupName}"`, "group_add");
    }
  };

  const handleGroupSelect = (id: string | null) => {
    setSelectedGroupId(id);
    setSelectedFieldId(null);
    setPendingCoordinates(null);
  };

  const handleDeleteGroup = (id: string) => {
    const targetGroup = groups.find(g => g.id === id);
    setGroups(groups.filter(g => g.id !== id));
    setFields(fields.map(f => f.groupId === id ? { ...f, groupId: undefined } : f));
    if (selectedGroupId === id) {
      setSelectedGroupId(null);
    }
    addActivity(`Deleted group "${targetGroup?.name || id}"`, "group_add");
  };

  const handleRenameGroup = (id: string, newName: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, name: newName } : g));
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = useCallback((type: 'group' | 'field', id: string, e: React.DragEvent) => {
    setDragItem({ type, id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${type}:${id}`);
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDragItem(null);
    setDragOverItem(null);
    setDragOverGroup(null);
  }, []);

  const handleGroupDragOver = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!dragItem) return;

    if (dragItem.type === 'group') {
      setDragOverItem({ type: 'group', id: groupId });
      setDragOverGroup(null);
    } else if (dragItem.type === 'field') {
      // Field is being dragged over a group — show "assign" indicator
      setDragOverGroup(groupId);
      setDragOverItem(null);
    }
  }, [dragItem]);

  const handleGroupDrop = useCallback((e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    if (!dragItem) return;

    if (dragItem.type === 'group' && dragItem.id !== targetGroupId) {
      // Reorder groups
      const dragIndex = groups.findIndex(g => g.id === dragItem.id);
      const dropIndex = groups.findIndex(g => g.id === targetGroupId);
      if (dragIndex !== -1 && dropIndex !== -1) {
        const newGroups = [...groups];
        const [removed] = newGroups.splice(dragIndex, 1);
        newGroups.splice(dropIndex, 0, removed);
        setGroups(newGroups);
      }
    } else if (dragItem.type === 'field') {
      // Assign field to this group
      setFields(fields.map(f => f.id === dragItem.id ? { ...f, groupId: targetGroupId } : f));
      // Auto-expand the group so the field is visible
      setExpandedGroups(prev => new Set(prev).add(targetGroupId));
    }

    setDragItem(null);
    setDragOverItem(null);
    setDragOverGroup(null);
  }, [dragItem, groups, fields]);

  const handleFieldDragOver = useCallback((e: React.DragEvent, fieldId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!dragItem || dragItem.type !== 'field') return;
    setDragOverItem({ type: 'field', id: fieldId });
    setDragOverGroup(null);
  }, [dragItem]);

  const handleFieldDrop = useCallback((e: React.DragEvent, targetFieldId: string) => {
    e.preventDefault();
    if (!dragItem || dragItem.type !== 'field' || dragItem.id === targetFieldId) return;

    // Reorder fields
    const dragIndex = fields.findIndex(f => f.id === dragItem.id);
    const dropIndex = fields.findIndex(f => f.id === targetFieldId);
    if (dragIndex !== -1 && dropIndex !== -1) {
      const newFields = [...fields];
      const [removed] = newFields.splice(dragIndex, 1);
      newFields.splice(dropIndex, 0, removed);
      setFields(newFields);
    }

    setDragItem(null);
    setDragOverItem(null);
    setDragOverGroup(null);
  }, [dragItem, fields]);

  // --- Export / Import Handlers ---
  const handleExportData = () => {
    const data = {
      version: 1,
      timestamp: new Date().toISOString(),
      fields,
      groups
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `tarla-verileri-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        // Strict structure and coordinate validation
        if (data && Array.isArray(data.fields) && Array.isArray(data.groups)) {
          const validatedFields: FieldPolygon[] = [];
          
          for (const f of data.fields) {
            if (!f || typeof f !== "object") continue;
            const item = f as Record<string, unknown>;
            if (typeof item.id !== "string" || typeof item.name !== "string" || !Array.isArray(item.coordinates)) {
              continue;
            }

            const validCoords: LatLngTuple[] = [];
            for (const coord of item.coordinates) {
              if (Array.isArray(coord) && coord.length >= 2) {
                const lat = Number(coord[0]);
                const lng = Number(coord[1]);
                if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                  validCoords.push([lat, lng]);
                }
              }
            }

            if (validCoords.length >= 3) {
              validatedFields.push({
                id: String(item.id).slice(0, 64),
                name: String(item.name).slice(0, 128),
                coordinates: validCoords,
                cropType: item.cropType ? String(item.cropType).slice(0, 64) : undefined,
                plantDate: item.plantDate ? new Date(item.plantDate as string | number | Date) : undefined,
                harvestDate: item.harvestDate ? new Date(item.harvestDate as string | number | Date) : undefined,
                groupId: item.groupId ? String(item.groupId).slice(0, 64) : undefined,
                color: item.color ? String(item.color).slice(0, 32) : undefined,
              });
            }
          }

          const validatedGroups = data.groups
            .filter((g: unknown) => g && typeof g === "object" && typeof (g as Record<string, unknown>).id === "string" && typeof (g as Record<string, unknown>).name === "string")
            .map((g: Record<string, unknown>) => ({
              id: String(g.id).slice(0, 64),
              name: String(g.name).slice(0, 128)
            }));

          setFields(validatedFields);
          setGroups(validatedGroups);
          addActivity(`Imported dataset (${validatedFields.length} valid fields, ${validatedGroups.length} groups)`, "import");

          // Clear file input so the same file can be selected again
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }

          alert("Data successfully imported.");
        } else {
          alert("Invalid file format. Please select a valid field data file.");
        }
      } catch (error) {
        console.error('Import error:', error);
        alert("Error reading file or corrupted file format.");
      }
    };

    reader.readAsText(file);
  };

  // Check if right panel should be open
  const isRightPanelOpen = pendingCoordinates !== null || selectedFieldId !== null || selectedGroupId !== null;

  return (
    <div className="flex h-screen w-full bg-zinc-50 dark:bg-zinc-950">
      {/* Left Sidebar */}
      <aside className="w-72 border-r bg-white dark:bg-zinc-900 flex flex-col pt-6 shadow-sm z-20">
        <div className="flex items-center gap-2 mb-8 px-6 text-emerald-600 dark:text-emerald-400">
          <Trees className="w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight">Field Manager</h1>
        </div>

        <div className="px-6 mb-4">
          {isDrawingMode ? (
            <Button
              variant="destructive"
              className="w-full bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              onClick={() => {
                setIsDrawingMode(false);
                setPendingCoordinates(null);
              }}
            >
              <X className="w-4 h-4" />
              {t.cancelDrawing}
            </Button>
          ) : (
            <Button
              variant="default"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              onClick={() => {
                setIsDrawingMode(true);
                setSelectedFieldId(null);
                setPendingCoordinates(null);
              }}
            >
              <Plus className="w-4 h-4" />
              {t.addNewField}
            </Button>
          )}
        </div>

        <nav className="flex flex-col flex-1 overflow-y-auto">
          <div className="px-6 py-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {t.fieldsAndGroups}
              </h3>
              <button
                onClick={() => setIsAddingGroup(!isAddingGroup)}
                className="text-zinc-400 hover:text-emerald-500 transition-colors"
                title={t.addNewGroup}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {isAddingGroup && (
              <div className="flex gap-2 mb-3">
                <Input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder={t.groupName}
                  className="h-8 text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                  autoFocus
                />
                <Button size="sm" onClick={handleAddGroup} className="h-8 bg-emerald-600 hover:bg-emerald-700">{t.addBtn}</Button>
              </div>
            )}

            {fields.length === 0 && groups.length === 0 ? (
              <div className="text-sm text-zinc-500 italic py-4 text-center border-2 border-dashed rounded-lg border-zinc-200 dark:border-zinc-800">
                {t.noFieldsOrGroups}
              </div>
            ) : (
              <ul className="space-y-1">
                {/* --- Groups as tree nodes --- */}
                {groups.map(group => {
                  const isExpanded = expandedGroups.has(group.id);
                  const groupFields = fields.filter(f => f.groupId === group.id);
                  return (
                    <li
                      key={group.id}
                      className={`transition-all duration-150 ${dragOverItem?.type === 'group' && dragOverItem.id === group.id
                        ? 'drag-over-indicator'
                        : ''
                        } ${dragOverGroup === group.id
                          ? 'drag-over-group'
                          : ''
                        } ${dragItem?.type === 'group' && dragItem.id === group.id
                          ? 'dragging'
                          : ''
                        }`}
                      draggable
                      onDragStart={(e) => handleDragStart('group', group.id, e)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleGroupDragOver(e, group.id)}
                      onDrop={(e) => handleGroupDrop(e, group.id)}
                    >
                      {/* Group header row */}
                      <div className="group/item relative">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            handleGroupSelect(group.id);
                            if (!isExpanded) toggleGroupExpand(group.id);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleGroupSelect(group.id); if (!isExpanded) toggleGroupExpand(group.id); } }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${selectedGroupId === group.id && !selectedFieldId
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-800"
                            : "hover:bg-zinc-100 text-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-300 border border-transparent"
                            }`}
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <GripVertical className="w-3.5 h-3.5 shrink-0 text-zinc-300 dark:text-zinc-600 cursor-grab active:cursor-grabbing" />
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); toggleGroupExpand(group.id); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleGroupExpand(group.id); } }}
                              className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                                : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                              }
                            </span>
                            {isExpanded
                              ? <FolderOpen className={`w-4 h-4 shrink-0 ${selectedGroupId === group.id && !selectedFieldId ? "text-emerald-500" : "text-amber-500"}`} />
                              : <Folder className={`w-4 h-4 shrink-0 ${selectedGroupId === group.id && !selectedFieldId ? "text-emerald-500" : "text-zinc-400"}`} />
                            }
                            <span className="truncate">{group.name}</span>
                            <span className="text-xs text-zinc-400 ml-1">({groupFields.length})</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover/item:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-all"
                          title={t.deleteBtn}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Nested fields inside this group */}
                      {isExpanded && groupFields.length > 0 && (
                        <ul className="ml-5 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700 space-y-0.5 mt-0.5 mb-1">
                          {groupFields.map(field => (
                            <li
                              key={field.id}
                              className={`group/field relative transition-all duration-150 ${dragOverItem?.type === 'field' && dragOverItem.id === field.id
                                ? 'drag-over-indicator'
                                : ''
                                } ${dragItem?.type === 'field' && dragItem.id === field.id
                                  ? 'dragging'
                                  : ''
                                }`}
                              draggable
                              onDragStart={(e) => { e.stopPropagation(); handleDragStart('field', field.id, e); }}
                              onDragEnd={handleDragEnd}
                              onDragOver={(e) => handleFieldDragOver(e, field.id)}
                              onDrop={(e) => { e.stopPropagation(); handleFieldDrop(e, field.id); }}
                            >
                              <button
                                onClick={() => handleFieldSelect(field.id)}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${selectedFieldId === field.id
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-800"
                                  : "hover:bg-zinc-100 text-zinc-600 dark:hover:bg-zinc-800 dark:text-zinc-400 border border-transparent"
                                  }`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <GripVertical className="w-3 h-3 shrink-0 text-zinc-300 dark:text-zinc-600 cursor-grab active:cursor-grabbing" />
                                  {field.color ? (
                                    <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-zinc-200 dark:border-zinc-600" style={{ backgroundColor: field.color }} />
                                  ) : (
                                    <MapPin className={`w-3.5 h-3.5 shrink-0 ${selectedFieldId === field.id ? "text-emerald-500" : "text-zinc-400"}`} />
                                  )}
                                  <span className="truncate text-[13px]">{field.name}</span>
                                </div>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteField(field.id); }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover/field:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-all"
                                title={t.deleteBtn}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {isExpanded && groupFields.length === 0 && (
                        <div className="ml-5 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700 py-2 mb-1">
                          <p className="text-xs text-zinc-400 italic">{t.dragDropHere}</p>
                        </div>
                      )}
                    </li>
                  );
                })}

                {/* --- Ungrouped fields at root level --- */}
                {fields.filter(f => !f.groupId).map(field => (
                  <li
                    key={field.id}
                    className={`group/field relative transition-all duration-150 ${dragOverItem?.type === 'field' && dragOverItem.id === field.id
                      ? 'drag-over-indicator'
                      : ''
                      } ${dragItem?.type === 'field' && dragItem.id === field.id
                        ? 'dragging'
                        : ''
                      }`}
                    draggable
                    onDragStart={(e) => handleDragStart('field', field.id, e)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleFieldDragOver(e, field.id)}
                    onDrop={(e) => handleFieldDrop(e, field.id)}
                  >
                    <button
                      onClick={() => handleFieldSelect(field.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${selectedFieldId === field.id
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-800"
                        : "hover:bg-zinc-100 text-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-300 border border-transparent"
                        }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <GripVertical className="w-3.5 h-3.5 shrink-0 text-zinc-300 dark:text-zinc-600 cursor-grab active:cursor-grabbing" />
                        {field.color ? (
                          <span className="w-4 h-4 shrink-0 rounded-full border border-zinc-200 dark:border-zinc-600" style={{ backgroundColor: field.color }} />
                        ) : (
                          <MapPin className={`w-4 h-4 shrink-0 ${selectedFieldId === field.id ? "text-emerald-500" : "text-zinc-400"}`} />
                        )}
                        <span className="truncate">{field.name}</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 opacity-0 transition-opacity ${selectedFieldId === field.id ? "opacity-100" : "group-hover/field:opacity-50"}`} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteField(field.id); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover/field:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-all"
                      title={t.deleteBtn}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </nav>

        <div className="mt-auto px-4 py-4 border-t flex flex-col gap-1">
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImportData}
            className="hidden"
          />
          <Button variant="ghost" className="justify-start gap-3 w-full text-zinc-500" onClick={handleExportData}>
            <Download className="w-4 h-4" />
            <span className="text-sm">{t.exportBtn}</span>
          </Button>
          <Button variant="ghost" className="justify-start gap-3 w-full text-zinc-500" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" />
            <span className="text-sm">{t.importBtn}</span>
          </Button>
          <Button variant="ghost" className="justify-start gap-3 w-full text-zinc-500" onClick={() => setIsAboutOpen(true)}>
            <Info className="w-4 h-4" />
            <span className="text-sm">{t.aboutBtn}</span>
          </Button>
          <Button variant="ghost" className="justify-start gap-3 w-full text-zinc-500" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="w-4 h-4" />
            <span className="text-sm">{t.settingsBtn}</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-0">
        <header className="h-16 border-b bg-white/80 backdrop-blur-md dark:bg-zinc-900/80 flex items-center justify-between px-6 shadow-sm absolute top-0 w-full z-10 pointer-events-none">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 pointer-events-auto">
            {isDrawingMode ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full text-sm border border-emerald-200 dark:border-emerald-800 font-medium">
                  <Edit2 className="w-4 h-4 animate-pulse" />
                  {t.drawingActive}
                </span>
                <button
                  onClick={() => {
                    setIsDrawingMode(false);
                    setPendingCoordinates(null);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 px-2.5 py-1 rounded-full border border-rose-200 dark:border-rose-800 transition-colors shadow-xs cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  {t.cancelDrawing}
                </button>
              </div>
            ) : t.mapView}
          </h2>
          
          <div className="pointer-events-auto flex items-center gap-3 relative">
            {/* Weather — always present, independent of any field selection */}
            <button
              onClick={() => setIsWeatherOpen(!isWeatherOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shadow-xs cursor-pointer ${
                isWeatherOpen
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-300"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 hover:border-zinc-300"
              }`}
              title={t.weatherTitle}
            >
              <CloudRain className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <span>{t.weatherTitle}</span>
            </button>

            {/* Agricultural Features & Modules Dropdown */}
            <FeaturesMenu
              fields={fields}
              selectedFieldId={selectedFieldId}
            />

            {/* Users & Team Management Panel */}
            <UsersMenu
              fields={fields}
              activities={activities}
              onAddActivity={addActivity}
              onClearActivities={clearActivities}
              activeUserName={activeUserName}
              onActiveUserChange={setActiveUserName}
            />
            
            {/* Weather Dashboard Popover — falls back to the map centre when no
                field is selected, so the panel always has something to show. */}
            {isWeatherOpen && (
              <div className="absolute top-full left-0 mt-2 z-50">
                {(() => {
                  const field = fields.find(f => f.id === selectedFieldId);
                  const center = (field ? getPolygonCenter(field.coordinates) : null) ?? DEFAULT_CENTER;
                  return (
                    <WeatherDashboard
                      lat={center[0]}
                      lon={center[1]}
                      locationLabel={field ? field.name : t.weatherMapCenter}
                    />
                  );
                })()}
              </div>
            )}
          </div>
        </header>

        {/* Map Container */}
        <div className="flex-1 w-full h-full relative z-0 bg-zinc-200 dark:bg-zinc-800">
          {isMounted && (
            <Map
              fields={selectedGroupId === null ? fields : fields.filter(f => f.groupId === selectedGroupId)}
              isDrawingMode={isDrawingMode}
              onPolygonCreated={handlePolygonCreated}
              selectedFieldId={selectedFieldId}
              onFieldClick={(id) => handleFieldSelect(id)}
            />
          )}
        </div>
      </main>

      {/* Right Data Panel */}
      {isRightPanelOpen && (
        <aside className="w-80 border-l bg-white dark:bg-zinc-900 flex flex-col shadow-xl z-20 animate-in slide-in-from-right duration-200">
          <div className="h-16 flex items-center justify-between px-6 border-b">
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">
              {selectedGroupId !== null && !selectedFieldId && !pendingCoordinates
                ? t.groupDetail
                : pendingCoordinates
                  ? t.newFieldDetail
                  : t.editField}
            </h2>
            <button
              onClick={() => {
                handleCancelForm();
                setSelectedGroupId(null);
              }}
              className="p-2 -mr-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            {selectedGroupId !== null && !selectedFieldId && !pendingCoordinates ? (() => {
              const group = groups.find(g => g.id === selectedGroupId);
              const groupFields = fields.filter(f => f.groupId === selectedGroupId);
              const uniqueCrops = Array.from(new Set(groupFields.map(f => f.cropType).filter(Boolean)));

              return (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="groupName">{t.groupName}</Label>
                    <Input
                      id="groupName"
                      value={group?.name || ""}
                      onChange={(e) => group && handleRenameGroup(group.id, e.target.value)}
                      placeholder={t.groupName}
                    />
                  </div>
                  <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div>
                      <div className="text-sm text-zinc-500 mb-1">{t.totalFields}</div>
                      <div className="font-medium">{groupFields.length} {t.itemsCount}</div>
                    </div>
                    <div>
                      <div className="text-sm text-zinc-500 mb-1">{t.plantedCrops}</div>
                      {uniqueCrops.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {uniqueCrops.map(crop => (
                            <span key={crop} className="px-2 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-md text-sm border border-emerald-100 dark:border-emerald-800">
                              {crop}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-400 italic">{t.noCropInfo}</div>
                      )}
                    </div>
                  </div>
                </>
              );
            })() : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">{t.fieldName}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t.fieldNamePlaceholder}
                  />
                </div>

                {/* Area Display */}
                {(selectedFieldId || pendingCoordinates) && (() => {
                  const coords = pendingCoordinates || fields.find(f => f.id === selectedFieldId)?.coordinates;
                  if (!coords || coords.length < 3) return null;
                  const areaM2 = calculatePolygonArea(coords);
                  const areaDekar = areaM2 / 1000;
                  return (
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800/50 p-4">
                      <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">{t.fieldArea}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-zinc-900/60 rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                            {areaM2 >= 1000 ? `${(areaM2 / 1000).toFixed(1)}k` : Math.round(areaM2).toLocaleString('tr-TR')}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">m²</div>
                        </div>
                        <div className="bg-white dark:bg-zinc-900/60 rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                            {areaDekar.toFixed(2)}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{t.decares}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <Label htmlFor="groupId">{t.groupLabel}</Label>
                  <select
                    id="groupId"
                    value={formData.groupId}
                    onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="unassigned">{t.ungrouped}</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cropType">{t.cropLabel}</Label>
                  <Input
                    id="cropType"
                    value={formData.cropType}
                    onChange={(e) => setFormData({ ...formData, cropType: e.target.value })}
                    placeholder={t.cropPlaceholder}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plantDate">{t.plantDate}</Label>
                  <Input
                    id="plantDate"
                    type="date"
                    value={formData.plantDate}
                    onChange={(e) => setFormData({ ...formData, plantDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="harvestDate">{t.harvestDate}</Label>
                  <Input
                    id="harvestDate"
                    type="date"
                    value={formData.harvestDate}
                    onChange={(e) => setFormData({ ...formData, harvestDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    {t.fieldColor}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { color: '#22c55e', name: '{t.colorNames.green}' },
                      { color: '#ef4444', name: '{t.colorNames.red}' },
                      { color: '#3b82f6', name: '{t.colorNames.blue}' },
                      { color: '#f97316', name: '{t.colorNames.orange}' },
                      { color: '#8b5cf6', name: '{t.colorNames.purple}' },
                      { color: '#eab308', name: '{t.colorNames.yellow}' },
                      { color: '#ec4899', name: '{t.colorNames.pink}' },
                      { color: '#06b6d4', name: '{t.colorNames.turquoise}' },
                    ].map(preset => (
                      <button
                        key={preset.color}
                        type="button"
                        title={preset.name}
                        onClick={() => setFormData({ ...formData, color: formData.color === preset.color ? '' : preset.color })}
                        className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${formData.color === preset.color
                          ? 'border-zinc-800 dark:border-white ring-2 ring-offset-2 ring-zinc-400 scale-110'
                          : 'border-zinc-200 dark:border-zinc-600'
                          }`}
                        style={{ backgroundColor: preset.color }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="relative cursor-pointer">
                      <input
                        type="color"
                        value={formData.color || '#22c55e'}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 ${formData.color && !['#22c55e', '#ef4444', '#3b82f6', '#f97316', '#8b5cf6', '#eab308', '#ec4899', '#06b6d4'].includes(formData.color)
                          ? 'border-zinc-800 dark:border-white ring-2 ring-offset-2 ring-zinc-400 scale-110'
                          : 'border-zinc-200 dark:border-zinc-600'
                          }`}
                        style={{ backgroundColor: formData.color && !['#22c55e', '#ef4444', '#3b82f6', '#f97316', '#8b5cf6', '#eab308', '#ec4899', '#06b6d4'].includes(formData.color) ? formData.color : '#d1d5db' }}
                      >
                        <Plus className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                      </div>
                    </label>
                    <span className="text-xs text-zinc-500">{t.colorCustom}</span>
                    {formData.color && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, color: '' })}
                        className="ml-auto text-xs text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        {t.colorRemove}
                      </button>
                    )}
                  </div>
                </div>

                {pendingCoordinates && (
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="text-xs text-zinc-500 mb-2">{t.coordinateData}</div>
                    <div className="bg-zinc-50 dark:bg-zinc-950 p-2 rounded text-xs font-mono text-zinc-600 line-clamp-3">
                      {pendingCoordinates.length} {t.pointsDrawn}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {(selectedFieldId || pendingCoordinates) && (
            <div className="p-4 border-t bg-zinc-50 dark:bg-zinc-900/50 flex gap-2">
              {!pendingCoordinates && (
                <Button
                  variant="destructive"
                  type="button"
                  className="flex-1"
                  onClick={() => selectedFieldId && handleDeleteField(selectedFieldId)}
                >
                  {t.deleteBtn}
                </Button>
              )}
              <Button
                className={`flex-1 ${pendingCoordinates ? "w-full" : ""}`}
                onClick={handleSaveField}
              >
                <Save className="w-4 h-4 mr-2" />
                {t.saveBtn}
              </Button>
            </div>
          )}
        </aside>
      )}
      {/* About Dialog */}
      <Dialog open={isAboutOpen} onOpenChange={setIsAboutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trees className="w-5 h-5 text-emerald-600" />
              {t.aboutTitle}
            </DialogTitle>
            <DialogDescription>
              {t.aboutDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t.aboutBody}
            </p>
            <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase">{t.licenseLabel}</h4>
              <p className="text-xs text-zinc-500">
                {t.licenseDesc}<br />
                {t.noWarranty}
              </p>
            </div>
            <div className="pt-4 border-t text-xs text-zinc-400 text-center">
              {t.versionLabel} 0.2.1 &bull; &copy; 2026 {t.contributorsLabel}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-600" />
              {t.settingsBtn}
            </DialogTitle>
            <DialogDescription>
              {t.settingsBtn}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Theme Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">{t.theme}</Label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'light' as const, label: t.themeLight, icon: Sun },
                  { value: 'dark' as const, label: t.themeDark, icon: Moon },
                  { value: 'system' as const, label: t.themeSystem, icon: Monitor },
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${theme === option.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${theme === option.value
                      ? 'bg-emerald-100 dark:bg-emerald-800/40'
                      : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                      <option.icon className={`w-5 h-5 transition-colors ${theme === option.value
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-500 dark:text-zinc-400'
                        }`} />
                    </div>
                    <span className={`text-sm font-medium transition-colors ${theme === option.value
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-zinc-600 dark:text-zinc-400'
                      }`}>{option.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {theme === 'system'
                  ? t.themeDesc
                  : theme === 'dark'
                    ? t.themeDarkActive
                    : t.themeLightActive}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Welcome Dialog */}
      <Dialog open={isWelcomeOpen} onOpenChange={(open) => {
        if (!open) {
          setIsWelcomeOpen(false);
          localStorage.setItem('fieldmanager-welcomed', 'true');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Trees className="w-6 h-6" />
              {t.welcomeTitle}
            </DialogTitle>
            <DialogDescription className="text-sm pt-2">
              {t.welcomeSubtitle}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-zinc-600 dark:text-zinc-300">
            <p>
              <strong>{t.howToUse}</strong>
              <br/>
              {t.howToUseDesc}
            </p>
            <p>
              <strong>{t.weatherFeature}</strong>
              <br/>
              {t.weatherDesc}
            </p>
            <Button 
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white" 
              onClick={() => {
                setIsWelcomeOpen(false);
                localStorage.setItem('fieldmanager-welcomed', 'true');
              }}
            >
              {t.startBtn}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
