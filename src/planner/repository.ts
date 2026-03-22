import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultPlannerData } from "./defaultData.js";
import type {
  ActiveDay,
  AssignmentRuleType,
  PlannerData,
  Routine,
  RoutineAssignmentRule,
  RoutineCheckin,
  RoutineDateOverride,
  RoutineItem,
  RoutineSet,
  Todo,
  TrackingType,
} from "./types.js";

export interface PlannerRepository {
  read(): Promise<PlannerData>;
  write(data: PlannerData): Promise<void>;
}

export class JsonPlannerRepository implements PlannerRepository {
  constructor(
    private readonly filePath: string,
    private readonly seedFactory: () => PlannerData = createDefaultPlannerData,
  ) {}

  async read(): Promise<PlannerData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const { data, migrated } = normalizePlannerData(parsed, this.seedFactory);
      if (migrated) {
        await this.write(data);
      }
      return data;
    } catch (error) {
      const code = getNodeErrorCode(error);
      if (code !== "ENOENT") {
        throw error;
      }

      const seed = this.seedFactory();
      await this.write(seed);
      return seed;
    }
  }

  async write(data: PlannerData): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}

function getNodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function normalizePlannerData(
  raw: unknown,
  seedFactory: () => PlannerData,
): { data: PlannerData; migrated: boolean } {
  const seed = seedFactory();
  if (!isRecord(raw)) {
    return { data: seed, migrated: true };
  }

  const routines = normalizeRoutines(getArray(raw, "routines"));
  const routineItems = normalizeRoutineItems(getArray(raw, "routineItems"));
  const routineCheckins = normalizeRoutineCheckins(getArray(raw, "routineCheckins"), routineItems);
  const routineSets = Array.isArray(raw.routineSets)
    ? normalizeRoutineSets(getArray(raw, "routineSets"), routines)
    : deriveRoutineSets(getArray(raw, "routines"), routines);
  const routineAssignmentRules = Array.isArray(raw.routineAssignmentRules)
    ? normalizeRoutineAssignmentRules(getArray(raw, "routineAssignmentRules"), routineSets)
    : deriveRoutineAssignmentRules(routineSets);
  const routineDateOverrides = Array.isArray(raw.routineDateOverrides)
    ? normalizeRoutineDateOverrides(getArray(raw, "routineDateOverrides"), routines, routineSets)
    : [];
  const todos = normalizeTodos(getArray(raw, "todos"));

  const migrated =
    !Array.isArray(raw.routineSets) ||
    !Array.isArray(raw.routineAssignmentRules) ||
    !Array.isArray(raw.routineDateOverrides) ||
    getArray(raw, "routines").some((entry) => isRecord(entry) && Array.isArray(entry.activeDays)) ||
    getArray(raw, "routineItems").some(
      (entry) =>
        isRecord(entry) &&
        (!isTrackingType(entry.trackingType) || !Number.isInteger(entry.targetCount)),
    ) ||
    getArray(raw, "routineCheckins").some(
      (entry) =>
        isRecord(entry) &&
        ("completedItemIds" in entry || !isRecord(entry.itemProgress)),
    );

  return {
    data: {
      routines,
      routineItems,
      routineCheckins,
      routineSets,
      routineAssignmentRules,
      routineDateOverrides,
      todos,
    },
    migrated,
  };
}

function normalizeRoutines(entries: unknown[]): Routine[] {
  return entries
    .filter(isRecord)
    .map((entry, index) => ({
      id: getString(entry, "id", `routine-${index + 1}`),
      name: getString(entry, "name", `Routine ${index + 1}`),
      color: normalizeRoutineColor(getString(entry, "color", "#f97316")),
      isArchived: getBoolean(entry, "isArchived", false),
      createdAt: getTimestamp(entry, "createdAt"),
      updatedAt: getTimestamp(entry, "updatedAt"),
    }));
}

function normalizeRoutineItems(entries: unknown[]): RoutineItem[] {
  return entries
    .filter(isRecord)
    .map((entry, index) => {
      const trackingType = normalizeTrackingType(entry.trackingType);
      return {
        id: getString(entry, "id", `item-${index + 1}`),
        routineId: getString(entry, "routineId", ""),
        title: getString(entry, "title", `Item ${index + 1}`),
        sortOrder: getPositiveInteger(entry, "sortOrder", index + 1),
        isActive: getBoolean(entry, "isActive", true),
        trackingType,
        targetCount: getTargetCount(entry.targetCount, trackingType),
      };
    })
    .filter((item) => item.routineId !== "");
}

function normalizeRoutineCheckins(entries: unknown[], routineItems: RoutineItem[]): RoutineCheckin[] {
  return entries
    .filter(isRecord)
    .map((entry) => {
      const routineId = getString(entry, "routineId", "");
      const items = routineItems.filter((item) => item.routineId === routineId && item.isActive);
      const itemProgress = isRecord(entry.itemProgress)
        ? normalizeProgress(entry.itemProgress, items)
        : normalizeLegacyCompletedItems(entry.completedItemIds, items);
      return {
        date: getString(entry, "date", "1970-01-01"),
        routineId,
        itemProgress,
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    })
    .filter((entry) => entry.routineId !== "");
}

function normalizeRoutineSets(entries: unknown[], routines: Routine[]): RoutineSet[] {
  const routineIds = routines.map((routine) => routine.id);
  return entries
    .filter(isRecord)
    .map((entry, index) => ({
      id: getString(entry, "id", `set-${index + 1}`),
      name: getString(entry, "name", `Set ${index + 1}`),
      routineIds: sanitizeStringArray(entry.routineIds, routineIds),
      createdAt: getTimestamp(entry, "createdAt"),
      updatedAt: getTimestamp(entry, "updatedAt"),
    }));
}

function deriveRoutineSets(sourceRoutines: unknown[], routines: Routine[]): RoutineSet[] {
  const weekdayIds = new Set<string>();
  const weekendIds = new Set<string>();
  const routineIdSet = new Set(routines.map((routine) => routine.id));

  sourceRoutines.filter(isRecord).forEach((entry, index) => {
    const routineId = getString(entry, "id", `routine-${index + 1}`);
    if (!routineIdSet.has(routineId)) {
      return;
    }

    const activeDays = getNumberArray(entry, "activeDays");
    if (activeDays.some((day) => day >= 1 && day <= 5)) {
      weekdayIds.add(routineId);
    }
    if (activeDays.some((day) => day === 0 || day === 6)) {
      weekendIds.add(routineId);
    }
  });

  const timestamp = new Date(0).toISOString();
  return [
    {
      id: "set-weekday",
      name: "Weekday",
      routineIds: [...weekdayIds],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "set-weekend",
      name: "Weekend",
      routineIds: [...weekendIds],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

function normalizeRoutineAssignmentRules(
  entries: unknown[],
  routineSets: RoutineSet[],
): RoutineAssignmentRule[] {
  const setIds = new Set(routineSets.map((routineSet) => routineSet.id));
  return entries
    .filter(isRecord)
    .map((entry, index) => {
      const ruleType = normalizeRuleType(entry.ruleType);
      const setId = getString(entry, "setId", "");
      if (!setIds.has(setId)) {
        return null;
      }
      return {
        id: getString(entry, "id", `assignment-${index + 1}`),
        ruleType,
        days: normalizeDays(ruleType, entry.days),
        setId,
        createdAt: getTimestamp(entry, "createdAt"),
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    })
    .filter((entry): entry is RoutineAssignmentRule => entry !== null);
}

function deriveRoutineAssignmentRules(routineSets: RoutineSet[]): RoutineAssignmentRule[] {
  const timestamp = new Date(0).toISOString();
  const rules: RoutineAssignmentRule[] = [];
  for (const routineSet of routineSets) {
    if (routineSet.id === "set-weekday") {
      rules.push({
        id: "assign-weekday",
        ruleType: "weekday",
        days: [1, 2, 3, 4, 5],
        setId: routineSet.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      continue;
    }
    if (routineSet.id === "set-weekend") {
      rules.push({
        id: "assign-weekend",
        ruleType: "weekend",
        days: [0, 6],
        setId: routineSet.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }
  return rules;
}

function normalizeRoutineDateOverrides(
  entries: unknown[],
  routines: Routine[],
  routineSets: RoutineSet[],
): RoutineDateOverride[] {
  const routineIds = routines.map((routine) => routine.id);
  const setIds = new Set(routineSets.map((routineSet) => routineSet.id));
  return entries
    .filter(isRecord)
    .map((entry) => {
      const setId = getNullableString(entry, "setId");
      return {
        date: getString(entry, "date", "1970-01-01"),
        setId: setId !== null && setIds.has(setId) ? setId : null,
        includeRoutineIds: sanitizeStringArray(entry.includeRoutineIds, routineIds),
        excludeRoutineIds: sanitizeStringArray(entry.excludeRoutineIds, routineIds),
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    });
}

function normalizeTodos(entries: unknown[]): Todo[] {
  return entries
    .filter(isRecord)
    .map((entry, index) => {
      const status = entry.status === "done" ? "done" : "pending";
      return {
        id: getString(entry, "id", `todo-${index + 1}`),
        title: getString(entry, "title", `Todo ${index + 1}`),
        note: getNullableString(entry, "note"),
        dueDate: getNullableString(entry, "dueDate"),
        status,
        completedAt: status === "done" ? getNullableString(entry, "completedAt") : null,
        createdAt: getTimestamp(entry, "createdAt"),
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function getString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function getPositiveInteger(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}

function getTimestamp(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" && value ? value : new Date(0).toISOString();
}

function getTargetCount(value: unknown, trackingType: TrackingType): number {
  if (trackingType === "binary") {
    return 1;
  }
  if (trackingType === "count") {
    return Number.isInteger(value) && (value as number) >= 2 ? (value as number) : 2;
  }
  return Number.isInteger(value) && (value as number) >= 1 ? (value as number) : 30;
}

function isTrackingType(value: unknown): value is TrackingType {
  return value === "binary" || value === "count" || value === "time";
}

function normalizeTrackingType(value: unknown): TrackingType {
  if (value === "time") return "time";
  return value === "count" ? "count" : "binary";
}

function normalizeProgress(
  rawProgress: Record<string, unknown>,
  items: RoutineItem[],
): Record<string, number> {
  return Object.fromEntries(
    items.map((item) => {
      const rawValue = rawProgress[item.id];
      const currentCount =
        Number.isFinite(rawValue) && typeof rawValue === "number" ? Math.trunc(rawValue) : 0;
      return [item.id, Math.max(0, Math.min(currentCount, item.targetCount))];
    }),
  );
}

function normalizeLegacyCompletedItems(
  rawCompletedItemIds: unknown,
  items: RoutineItem[],
): Record<string, number> {
  const completed = new Set(Array.isArray(rawCompletedItemIds) ? rawCompletedItemIds : []);
  return Object.fromEntries(
    items.map((item) => [item.id, completed.has(item.id) ? 1 : 0]),
  );
}

function sanitizeStringArray(value: unknown, allowedIds: string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowed = new Set(allowedIds);
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))].filter((entry) =>
    allowed.has(entry),
  );
}

function getNumberArray(record: Record<string, unknown>, key: string): number[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is number => Number.isInteger(entry));
}

function normalizeRuleType(value: unknown): AssignmentRuleType {
  if (value === "weekday" || value === "weekend" || value === "custom-days") {
    return value;
  }
  return "custom-days";
}

function normalizeRoutineColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#f97316";
}

function normalizeDays(ruleType: AssignmentRuleType, value: unknown): ActiveDay[] {
  if (ruleType === "weekday") {
    return [1, 2, 3, 4, 5];
  }
  if (ruleType === "weekend") {
    return [0, 6];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is ActiveDay => Number.isInteger(entry) && entry >= 0 && entry <= 6))];
}
