"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { type FieldPolygon } from "@/components/Map";
import {
  emptyData,
  type FertilizerLog,
  type FieldData,
  type IrrigationLog,
  type StoredDocument,
  type StoredField,
} from "@/lib/field-data";
import { type SoilAnalysis } from "@/lib/soil";

/**
 * Owns everything the server keeps: the fields and groups themselves plus the
 * records attached to them. The whole document is read once on mount and
 * written back, debounced, whenever any part of it changes.
 *
 * Browser storage still holds the things that are about this browser rather
 * than about the farm — theme, pinned tools, the welcome flag.
 */

const ENDPOINT = "/api/data";
const SAVE_DEBOUNCE_MS = 800;

// Records these modules kept in localStorage before the server store existed.
// They are adopted once and then removed; see `migrateLocalRecords`.
const LEGACY_KEYS = {
  soilAnalyses: "fieldmanager-soil-analyses",
  irrigationLogs: "fieldmanager-irrigation-logs",
  fertilizerLogs: "fieldmanager-fertilizer-logs",
} as const;

export type SyncStatus = "loading" | "idle" | "saving" | "error";

interface FieldDataContextValue {
  ready: boolean;
  status: SyncStatus;
  error: string | null;
  /** Set when the server had newer data and this session adopted it. */
  reloadedFromServer: boolean;
  dismissReloadNotice: () => void;
  retry: () => void;

  fields: FieldPolygon[];
  setFields: Dispatch<SetStateAction<FieldPolygon[]>>;
  groups: { id: string; name: string }[];
  setGroups: Dispatch<SetStateAction<{ id: string; name: string }[]>>;
  soilAnalyses: SoilAnalysis[];
  setSoilAnalyses: Dispatch<SetStateAction<SoilAnalysis[]>>;
  irrigationLogs: IrrigationLog[];
  setIrrigationLogs: Dispatch<SetStateAction<IrrigationLog[]>>;
  fertilizerLogs: FertilizerLog[];
  setFertilizerLogs: Dispatch<SetStateAction<FertilizerLog[]>>;
}

const FieldDataContext = createContext<FieldDataContextValue | null>(null);

export function useFieldData(): FieldDataContextValue {
  const value = useContext(FieldDataContext);
  if (!value) {
    throw new Error("useFieldData must be used inside <FieldDataProvider>.");
  }
  return value;
}

// JSON has no date type, so the wire format carries ISO strings and the app
// works with `Date` objects on either side of these two functions.
function toFieldPolygon(stored: StoredField): FieldPolygon {
  return {
    id: stored.id,
    name: stored.name,
    coordinates: stored.coordinates,
    cropType: stored.cropType,
    plantDate: stored.plantDate ? new Date(stored.plantDate) : undefined,
    harvestDate: stored.harvestDate ? new Date(stored.harvestDate) : undefined,
    groupId: stored.groupId,
    color: stored.color,
  };
}

function toStoredField(field: FieldPolygon): StoredField {
  const iso = (value: Date | undefined) => {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  };
  return {
    id: field.id,
    name: field.name,
    coordinates: field.coordinates.map(([lat, lng]) => [lat, lng] as [number, number]),
    cropType: field.cropType || undefined,
    plantDate: iso(field.plantDate),
    harvestDate: iso(field.harvestDate),
    groupId: field.groupId || undefined,
    color: field.color || undefined,
  };
}

function readLegacy<T>(key: string): T[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Earlier versions kept the module records in this browser. If the server has
 * none of a given kind and this browser does, adopt them once so upgrading
 * doesn't look like the records were lost, then clear the local copy.
 */
function migrateLocalRecords(data: FieldData): { data: FieldData; migrated: boolean } {
  if (typeof window === "undefined") return { data, migrated: false };
  let migrated = false;
  const next = { ...data };

  if (next.soilAnalyses.length === 0) {
    const local = readLegacy<SoilAnalysis>(LEGACY_KEYS.soilAnalyses);
    if (local.length > 0) {
      next.soilAnalyses = local;
      migrated = true;
    }
  }
  if (next.irrigationLogs.length === 0) {
    const local = readLegacy<IrrigationLog>(LEGACY_KEYS.irrigationLogs);
    if (local.length > 0) {
      next.irrigationLogs = local;
      migrated = true;
    }
  }
  if (next.fertilizerLogs.length === 0) {
    const local = readLegacy<FertilizerLog>(LEGACY_KEYS.fertilizerLogs);
    if (local.length > 0) {
      next.fertilizerLogs = local;
      migrated = true;
    }
  }

  return { data: next, migrated };
}

function clearLegacyKeys() {
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // A browser that refuses storage has nothing to clear either.
    }
  }
}

export default function FieldDataProvider({ children }: { children: ReactNode }) {
  const [fields, setFields] = useState<FieldPolygon[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [soilAnalyses, setSoilAnalyses] = useState<SoilAnalysis[]>([]);
  const [irrigationLogs, setIrrigationLogs] = useState<IrrigationLog[]>([]);
  const [fertilizerLogs, setFertilizerLogs] = useState<FertilizerLog[]>([]);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadedFromServer, setReloadedFromServer] = useState(false);
  const [loadToken, setLoadToken] = useState(0);

  const revisionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the save effect: it must not fire for the state that loading itself
  // installed, only for edits made afterwards.
  const skipNextSaveRef = useRef(false);
  const pendingMigrationRef = useRef(false);

  const applyDocument = useCallback((document: StoredDocument) => {
    revisionRef.current = document.revision;
    setFields(document.fields.map(toFieldPolygon));
    setGroups(document.groups);
    setSoilAnalyses(document.soilAnalyses);
    setIrrigationLogs(document.irrigationLogs);
    setFertilizerLogs(document.fertilizerLogs);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      try {
        const response = await fetch(ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Server responded with ${response.status}.`);
        }
        const document = (await response.json()) as StoredDocument;
        if (cancelled) return;

        const { data, migrated } = migrateLocalRecords(document);
        applyDocument({ ...document, ...data });
        // A migration is the one case where loading should be followed by a
        // write, so the adopted records reach the server.
        skipNextSaveRef.current = !migrated;
        pendingMigrationRef.current = migrated;
        setError(null);
        setStatus("idle");
        setReady(true);
      } catch (loadError) {
        if (cancelled) return;
        console.error("Could not load field data:", loadError);
        setError(loadError instanceof Error ? loadError.message : "Could not load saved data.");
        setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [applyDocument, loadToken]);

  // Debounced write-back. Every edit anywhere in the document lands here.
  useEffect(() => {
    if (!ready) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    const payload: FieldData = {
      ...emptyData(),
      fields: fields.map(toStoredField),
      groups,
      soilAnalyses,
      irrigationLogs,
      fertilizerLogs,
    };

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const response = await fetch(ENDPOINT, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: revisionRef.current, data: payload }),
        });

        if (response.status === 409) {
          // Another session got there first. Its version wins; adopting it is
          // better than overwriting edits this tab never saw.
          const document = (await response.json()) as StoredDocument;
          skipNextSaveRef.current = true;
          applyDocument(document);
          setReloadedFromServer(true);
          setError(null);
          setStatus("idle");
          return;
        }

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Server responded with ${response.status}.`);
        }

        const document = (await response.json()) as StoredDocument;
        revisionRef.current = document.revision;
        if (pendingMigrationRef.current) {
          pendingMigrationRef.current = false;
          clearLegacyKeys();
        }
        setError(null);
        setStatus("idle");
      } catch (saveError) {
        console.error("Could not save field data:", saveError);
        setError(saveError instanceof Error ? saveError.message : "Could not save changes.");
        setStatus("error");
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [ready, fields, groups, soilAnalyses, irrigationLogs, fertilizerLogs, applyDocument]);

  const retry = useCallback(() => {
    if (ready) {
      // A failed save still has the edits in state; nudging the effect retries.
      setStatus("idle");
      setFields((prev) => [...prev]);
    } else {
      setLoadToken((token) => token + 1);
    }
  }, [ready]);

  const dismissReloadNotice = useCallback(() => setReloadedFromServer(false), []);

  return (
    <FieldDataContext.Provider
      value={{
        ready,
        status,
        error,
        reloadedFromServer,
        dismissReloadNotice,
        retry,
        fields,
        setFields,
        groups,
        setGroups,
        soilAnalyses,
        setSoilAnalyses,
        irrigationLogs,
        setIrrigationLogs,
        fertilizerLogs,
        setFertilizerLogs,
      }}
    >
      {children}
    </FieldDataContext.Provider>
  );
}
