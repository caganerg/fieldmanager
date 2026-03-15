"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Trees, MapPin, Database, Settings, Trash2, Edit2, ChevronRight, ChevronDown, Save, X, Plus, Folder, FolderOpen, LayoutGrid, GripVertical, Palette, Download, Upload, Info } from "lucide-react";
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
import type { LatLngTuple } from "leaflet";

// Dynamically import Map with SSR disabled since Leaflet requires window/document
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-100 dark:bg-slate-900 absolute inset-0">Harita yükleniyor...</div>
});

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
    setIsMounted(true);
  }, []);

  const handlePolygonCreated = (coordinates: LatLngTuple[]) => {
    // Once polygon is drawn, stop drawing mode and open the new field form
    setIsDrawingMode(false);
    setPendingCoordinates(coordinates);
    setSelectedFieldId(null);
    setSelectedGroupId(null);
    setFormData({
      name: `Tarla ${fields.length + 1}`,
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
      const newField: FieldPolygon = {
        id: Math.random().toString(36).substr(2, 9),
        name: formData.name || `Tarlam ${fields.length + 1}`,
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
    } else if (selectedFieldId) {
      // Update existing field
      setFields(fields.map(f => f.id === selectedFieldId ? {
        ...f,
        name: formData.name,
        cropType: formData.cropType,
        plantDate: formData.plantDate ? new Date(formData.plantDate) : undefined,
        harvestDate: formData.harvestDate ? new Date(formData.harvestDate) : undefined,
        groupId: formData.groupId === "unassigned" ? undefined : formData.groupId,
        color: formData.color || undefined
      } : f));
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
        plantDate: field.plantDate ? new Date(field.plantDate.getTime() - field.plantDate.getTimezoneOffset() * 60000).toISOString().split('T')[0] : "",
        harvestDate: field.harvestDate ? new Date(field.harvestDate.getTime() - field.harvestDate.getTimezoneOffset() * 60000).toISOString().split('T')[0] : "",
        groupId: field.groupId || "unassigned",
        color: field.color || ""
      });
    }
  };

  const handleDeleteField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    if (selectedFieldId === id) {
      setSelectedFieldId(null);
    }
  };

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      setGroups([...groups, {
        id: Math.random().toString(36).substr(2, 9),
        name: newGroupName.trim()
      }]);
      setNewGroupName("");
      setIsAddingGroup(false);
    }
  };

  const handleGroupSelect = (id: string | null) => {
    setSelectedGroupId(id);
    setSelectedFieldId(null);
    setPendingCoordinates(null);
  };

  const handleDeleteGroup = (id: string) => {
    setGroups(groups.filter(g => g.id !== id));
    setFields(fields.map(f => f.groupId === id ? { ...f, groupId: undefined } : f));
    if (selectedGroupId === id) {
      setSelectedGroupId(null);
    }
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

        // Basic validation
        if (data && data.fields && Array.isArray(data.fields) && data.groups && Array.isArray(data.groups)) {
          // Parse dates back to Date objects
          const parsedFields = data.fields.map((f: any) => ({
            ...f,
            plantDate: f.plantDate ? new Date(f.plantDate) : undefined,
            harvestDate: f.harvestDate ? new Date(f.harvestDate) : undefined,
          }));

          setFields(parsedFields);
          setGroups(data.groups);

          // Clear file input so the same file can be selected again
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }

          alert('Veriler başarıyla içe aktarıldı.');
        } else {
          alert('Geçersiz dosya formatı. Lütfen doğru bir tarla verisi dosyası seçin.');
        }
      } catch (error) {
        console.error('Import error:', error);
        alert('Dosya okunurken bir hata oluştu veya format bozuk.');
      }
    };

    reader.readAsText(file);
  };

  // Check if right panel should be open
  const isRightPanelOpen = pendingCoordinates !== null || selectedFieldId !== null || selectedGroupId !== null;

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950">
      {/* Left Sidebar */}
      <aside className="w-72 border-r bg-white dark:bg-slate-900 flex flex-col pt-6 shadow-sm z-20">
        <div className="flex items-center gap-2 mb-8 px-6 text-emerald-600 dark:text-emerald-400">
          <Trees className="w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight">Field Manager</h1>
        </div>

        <div className="px-6 mb-4">
          <Button
            variant="default"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            onClick={() => {
              setIsDrawingMode(true);
              setSelectedFieldId(null);
              setPendingCoordinates(null);
            }}
            disabled={isDrawingMode}
          >
            {isDrawingMode ? "Haritada Çiziliyor..." : "Yeni Tarla Ekle +"}
          </Button>
        </div>

        <nav className="flex flex-col flex-1 overflow-y-auto">
          <div className="px-6 py-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Tarlalar & Gruplar
              </h3>
              <button
                onClick={() => setIsAddingGroup(!isAddingGroup)}
                className="text-slate-400 hover:text-emerald-500 transition-colors"
                title="Yeni Grup Ekle"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {isAddingGroup && (
              <div className="flex gap-2 mb-3">
                <Input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Grup Adı"
                  className="h-8 text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                  autoFocus
                />
                <Button size="sm" onClick={handleAddGroup} className="h-8 bg-emerald-600 hover:bg-emerald-700">Ekle</Button>
              </div>
            )}

            {fields.length === 0 && groups.length === 0 ? (
              <div className="text-sm text-slate-500 italic py-4 text-center border-2 border-dashed rounded-lg border-slate-200 dark:border-slate-800">
                Henüz tarla veya grup eklenmedi.
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
                            : "hover:bg-slate-100 text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300 border border-transparent"
                            }`}
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <GripVertical className="w-3.5 h-3.5 shrink-0 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing" />
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); toggleGroupExpand(group.id); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleGroupExpand(group.id); } }}
                              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                              }
                            </span>
                            {isExpanded
                              ? <FolderOpen className={`w-4 h-4 shrink-0 ${selectedGroupId === group.id && !selectedFieldId ? "text-emerald-500" : "text-amber-500"}`} />
                              : <Folder className={`w-4 h-4 shrink-0 ${selectedGroupId === group.id && !selectedFieldId ? "text-emerald-500" : "text-slate-400"}`} />
                            }
                            <span className="truncate">{group.name}</span>
                            <span className="text-xs text-slate-400 ml-1">({groupFields.length})</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover/item:opacity-100 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-all"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Nested fields inside this group */}
                      {isExpanded && groupFields.length > 0 && (
                        <ul className="ml-5 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-0.5 mt-0.5 mb-1">
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
                                  : "hover:bg-slate-100 text-slate-600 dark:hover:bg-slate-800 dark:text-slate-400 border border-transparent"
                                  }`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing" />
                                  {field.color ? (
                                    <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-slate-200 dark:border-slate-600" style={{ backgroundColor: field.color }} />
                                  ) : (
                                    <MapPin className={`w-3.5 h-3.5 shrink-0 ${selectedFieldId === field.id ? "text-emerald-500" : "text-slate-400"}`} />
                                  )}
                                  <span className="truncate text-[13px]">{field.name}</span>
                                </div>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteField(field.id); }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover/field:opacity-100 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-all"
                                title="Sil"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {isExpanded && groupFields.length === 0 && (
                        <div className="ml-5 pl-3 border-l-2 border-slate-200 dark:border-slate-700 py-2 mb-1">
                          <p className="text-xs text-slate-400 italic">Tarla sürükleyerek ekleyin</p>
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
                        : "hover:bg-slate-100 text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300 border border-transparent"
                        }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <GripVertical className="w-3.5 h-3.5 shrink-0 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing" />
                        {field.color ? (
                          <span className="w-4 h-4 shrink-0 rounded-full border border-slate-200 dark:border-slate-600" style={{ backgroundColor: field.color }} />
                        ) : (
                          <MapPin className={`w-4 h-4 shrink-0 ${selectedFieldId === field.id ? "text-emerald-500" : "text-slate-400"}`} />
                        )}
                        <span className="truncate">{field.name}</span>
                      </div>
                      <ChevronRight className={`w-4 h-4 opacity-0 transition-opacity ${selectedFieldId === field.id ? "opacity-100" : "group-hover/field:opacity-50"}`} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteField(field.id); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover/field:opacity-100 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-all"
                      title="Sil"
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
          <Button variant="ghost" className="justify-start gap-3 w-full text-slate-500" onClick={handleExportData}>
            <Download className="w-4 h-4" />
            <span className="text-sm">Dışa Aktar</span>
          </Button>
          <Button variant="ghost" className="justify-start gap-3 w-full text-slate-500" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" />
            <span className="text-sm">İçe Aktar</span>
          </Button>
          <Button variant="ghost" className="justify-start gap-3 w-full text-slate-500" onClick={() => setIsAboutOpen(true)}>
            <Info className="w-4 h-4" />
            <span className="text-sm">Hakkında</span>
          </Button>
          <Link href="/ayarlar" className="w-full">
            <Button variant="ghost" className="justify-start gap-3 w-full text-slate-500">
              <Settings className="w-4 h-4" />
              <span className="text-sm">Ayarlar</span>
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-0">
        <header className="h-16 border-b bg-white/80 backdrop-blur-md dark:bg-slate-900/80 flex items-center px-6 shadow-sm absolute top-0 w-full z-10 pointer-events-none">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 pointer-events-auto">
            {isDrawingMode ? (
              <span className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-sm border border-emerald-200">
                <Edit2 className="w-4 h-4 animate-pulse" />
                Haritada Tarla Çizimi Aktif...
              </span>
            ) : "Harita Görünümü"}
          </h2>
        </header>

        {/* Map Container */}
        <div className="flex-1 w-full h-full relative z-0 bg-slate-200 dark:bg-slate-800">
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
        <aside className="w-80 border-l bg-white dark:bg-slate-900 flex flex-col shadow-xl z-20 animate-in slide-in-from-right duration-200">
          <div className="h-16 flex items-center justify-between px-6 border-b">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              {selectedGroupId !== null && !selectedFieldId && !pendingCoordinates
                ? "Grup Detayı"
                : pendingCoordinates
                  ? "Yeni Tarla Detayı"
                  : "Tarla Düzenle"}
            </h2>
            <button
              onClick={() => {
                handleCancelForm();
                setSelectedGroupId(null);
              }}
              className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
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
                    <Label htmlFor="groupName">Grup Adı</Label>
                    <Input
                      id="groupName"
                      value={group?.name || ""}
                      onChange={(e) => group && handleRenameGroup(group.id, e.target.value)}
                      placeholder="Grup adı girin"
                    />
                  </div>
                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-sm text-slate-500 mb-1">Toplam Tarla</div>
                      <div className="font-medium">{groupFields.length} adet</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 mb-1">Ekilen Ürünler</div>
                      {uniqueCrops.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {uniqueCrops.map(crop => (
                            <span key={crop} className="px-2 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-md text-sm border border-emerald-100 dark:border-emerald-800">
                              {crop}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400 italic">Ürün bilgisi yok</div>
                      )}
                    </div>
                  </div>
                </>
              );
            })() : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Tarla Adı / Parsel No</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Örn: 145 Ada 2 Parsel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="groupId">Ait Olduğu Grup</Label>
                  <select
                    id="groupId"
                    value={formData.groupId}
                    onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="unassigned">Grupsuz</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cropType">Ekili Ürün</Label>
                  <Input
                    id="cropType"
                    value={formData.cropType}
                    onChange={(e) => setFormData({ ...formData, cropType: e.target.value })}
                    placeholder="Örn: Buğday, Mısır, Ayçiçeği..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plantDate">Ekim Tarihi</Label>
                  <Input
                    id="plantDate"
                    type="date"
                    value={formData.plantDate}
                    onChange={(e) => setFormData({ ...formData, plantDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="harvestDate">Tahmini Hasat Tarihi</Label>
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
                    Tarla Rengi
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { color: '#22c55e', name: 'Yeşil' },
                      { color: '#ef4444', name: 'Kırmızı' },
                      { color: '#3b82f6', name: 'Mavi' },
                      { color: '#f97316', name: 'Turuncu' },
                      { color: '#8b5cf6', name: 'Mor' },
                      { color: '#eab308', name: 'Sarı' },
                      { color: '#ec4899', name: 'Pembe' },
                      { color: '#06b6d4', name: 'Turkuaz' },
                    ].map(preset => (
                      <button
                        key={preset.color}
                        type="button"
                        title={preset.name}
                        onClick={() => setFormData({ ...formData, color: formData.color === preset.color ? '' : preset.color })}
                        className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${formData.color === preset.color
                          ? 'border-slate-800 dark:border-white ring-2 ring-offset-2 ring-slate-400 scale-110'
                          : 'border-slate-200 dark:border-slate-600'
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
                          ? 'border-slate-800 dark:border-white ring-2 ring-offset-2 ring-slate-400 scale-110'
                          : 'border-slate-200 dark:border-slate-600'
                          }`}
                        style={{ backgroundColor: formData.color && !['#22c55e', '#ef4444', '#3b82f6', '#f97316', '#8b5cf6', '#eab308', '#ec4899', '#06b6d4'].includes(formData.color) ? formData.color : '#d1d5db' }}
                      >
                        <Plus className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                      </div>
                    </label>
                    <span className="text-xs text-slate-500">Özel renk</span>
                    {formData.color && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, color: '' })}
                        className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors"
                      >
                        Rengi kaldır
                      </button>
                    )}
                  </div>
                </div>

                {pendingCoordinates && (
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 mb-2">Koordinat Verisi</div>
                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded text-xs font-mono text-slate-600 line-clamp-3">
                      {pendingCoordinates.length} köşe noktası çizildi.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {(selectedFieldId || pendingCoordinates) && (
            <div className="p-4 border-t bg-slate-50 dark:bg-slate-900/50 flex gap-2">
              {!pendingCoordinates && (
                <Button
                  variant="destructive"
                  type="button"
                  className="flex-1"
                  onClick={() => selectedFieldId && handleDeleteField(selectedFieldId)}
                >
                  Sil
                </Button>
              )}
              <Button
                className={`flex-1 ${pendingCoordinates ? "w-full" : ""}`}
                onClick={handleSaveField}
              >
                <Save className="w-4 h-4 mr-2" />
                Kaydet
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
              Field Manager Hakkında
            </DialogTitle>
            <DialogDescription>
              Tarla ve ürün yönetimi için dijital çözüm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Field Manager, çiftçilerin ve tarım işletmelerinin arazilerini harita üzerinden kolayca yönetmelerini sağlayan bir uygulamadır.
            </p>
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-semibold text-slate-500 uppercase">Lisans</h4>
              <p className="text-xs text-slate-500">
                Licensed under GNU GPLv3<br />
                This program comes with ABSOLUTELY NO WARRANTY.
              </p>
            </div>
            <div className="pt-4 border-t text-xs text-slate-400 text-center">
              Version 0.1.0 &bull; &copy; 2026 Field Manager Contributors
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
