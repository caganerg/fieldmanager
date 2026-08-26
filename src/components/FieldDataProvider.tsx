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
import {
  DEFAULT_USERS,
  defaultActivity,
  type ActivityItem,
  type UserMember,
} from "@/lib/team";

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
  users: "fieldmanager-users",
  activities: "fieldmanager-activities",
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
  users: UserMember[];
  setUsers: Dispatch<SetStateAction<UserMember[]>>;
  activities: ActivityItem[];
  setActivities: Dispatch<SetStateAction<ActivityItem[]>>;
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
 * Fills in the slices the server had nothing for.
 *
 * Two sources, in order. Earlier versions kept these records in this browser,
 * so an empty slice adopts the local copy once — upgrading should not look like
 * the records were lost. Failing that, the team and the activity log fall back
 * to their seeds, the way they did when they were read from localStorage, so a
 * fresh workspace is never a blank screen.
 *
 * `changed` says whether the result differs from what the server sent, which is
 * what decides if loading should be followed by a write.
 */
function prepareLoadedData(data: FieldData): { data: FieldData; changed: boolean } {
  if (typeof window === "undefined") return { data, changed: false };
  let changed = false;
  const next = { ...data };

  const adopt = <K extends keyof FieldData>(key: K, legacyKey: string) => {
    if (next[key].length > 0) return;
    const local = readLegacy<FieldData[K][number]>(legacyKey);
    if (local.length === 0) return;
    next[key] = local as FieldData[K];
    changed = true;
  };

  adopt("soilAnalyses", LEGACY_KEYS.soilAnalyses);
  adopt("irrigationLogs", LEGACY_KEYS.irrigationLogs);
  adopt("fertilizerLogs", LEGACY_KEYS.fertilizerLogs);
  adopt("users", LEGACY_KEYS.users);
  adopt("activities", LEGACY_KEYS.activities);

  if (next.users.length === 0) {
    next.users = DEFAULT_USERS;
    changed = true;
  }
  if (next.activities.length === 0) {
    next.activities = [defaultActivity()];
    changed = true;
  }

  return { data: next, changed };
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
  // Seeded rather than empty so the server render and the first client render
  // agree, and so the team panel always has somebody to show while the document
  // is still in flight. The loaded document replaces this.
  const [users, setUsers] = useState<UserMember[]>(DEFAULT_USERS);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

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

  // Mirrors what is on screen, so the load can tell whether anything was drawn
  // while the request was still in flight. Kept in an effect rather than
  // written during render, and only read from an async callback, by which time
  // it has caught up.
  const latestRef = useRef({ fields, groups });
  useEffect(() => {
    latestRef.current = { fields, groups };
  }, [fields, groups]);

  const applyDocument = useCallback((document: StoredDocument) => {
    revisionRef.current = document.revision;
    setFields(document.fields.map(toFieldPolygon));
    setGroups(document.groups);
    setSoilAnalyses(document.soilAnalyses);
    setIrrigationLogs(document.irrigationLogs);
    setFertilizerLogs(document.fertilizerLogs);
    setUsers(document.users);
    setActivities(document.activities);
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

        const { data, changed } = prepareLoadedData(document);

        // A field drawn before the document arrived has no counterpart on the
        // server. Carry it over instead of dropping it, so the load is never
        // destructive and the map stays usable while the request is in flight.
        const knownFields = new Set(data.fields.map((field) => field.id));
        const knownGroups = new Set(data.groups.map((group) => group.id));
        const localFields = latestRef.current.fields.filter((f) => !knownFields.has(f.id));
        const localGroups = latestRef.current.groups.filter((g) => !knownGroups.has(g.id));

        applyDocument({ ...document, ...data });
        if (localFields.length > 0) setFields((prev) => [...prev, ...localFields]);
        if (localGroups.length > 0) setGroups((prev) => [...prev, ...localGroups]);

        // Adopted records, seeded defaults and carried-over edits are the cases
        // where loading should be followed by a write, so they reach the server.
        const carried = localFields.length > 0 || localGroups.length > 0;
        skipNextSaveRef.current = !(changed || carried);
        pendingMigrationRef.current = changed;
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
      users,
      activities,
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
  }, [
    ready,
    fields,
    groups,
    soilAnalyses,
    irrigationLogs,
    fertilizerLogs,
    users,
    activities,
    applyDocument,
  ]);

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
        users,
        setUsers,
        activities,
        setActivities,
      }}
    >
      {children}
    </FieldDataContext.Provider>
  );
}
