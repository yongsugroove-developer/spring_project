import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultPlannerData } from "./defaultData.js";
import type {
  ActiveDay,
  Habit,
  HabitCheckin,
  PlannerData,
  Routine,
  RoutineMode,
  RoutineModeOverride,
  Task,
  TrackingType,
} from "./types.js";
import { normalizeStoredHabitCheckin } from "./validation.js";

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

export function normalizePlannerData(
  raw: unknown,
  seedFactory: () => PlannerData = createDefaultPlannerData,
): { data: PlannerData; migrated: boolean } {
  const seed = seedFactory();
  if (!isRecord(raw)) {
    return { data: seed, migrated: true };
  }

  if (
    Array.isArray(raw.habits) ||
    Array.isArray(raw.tasks) ||
    Array.isArray(raw.habitCheckins) ||
    Array.isArray(raw.routineModes)
  ) {
    return normalizeCurrentPlannerData(raw);
  }

  return migrateLegacyPlannerData(raw, seed);
}

function normalizeCurrentPlannerData(raw: Record<string, unknown>): { data: PlannerData; migrated: boolean } {
  const habits = normalizeHabits(getArray(raw, "habits"));
  const routines = normalizeRoutines(getArray(raw, "routines"), habits);
  const modes = normalizeRoutineModes(getArray(raw, "routineModes"), habits, routines);
  const overrides = normalizeRoutineModeOverrides(getArray(raw, "routineModeOverrides"), modes.routineModes);
  const checkins = normalizeHabitCheckins(getArray(raw, "habitCheckins"), habits);
  const tasks = normalizeTasks(getArray(raw, "tasks"));

  const migrated =
    getArray(raw, "habits").some((entry) => isRecord(entry) && !("tag" in entry)) ||
    getArray(raw, "routines").some(
      (entry) => isRecord(entry) && (!("notificationEnabled" in entry) || !Array.isArray(entry.habitIds)),
    ) ||
    getArray(raw, "tasks").some((entry) => isRecord(entry) && !("emoji" in entry)) ||
    !Array.isArray(raw.routineModes) ||
    !Array.isArray(raw.routineModeOverrides) ||
    checkins.migrated ||
    modes.migrated ||
    overrides.migrated;

  return {
    data: {
      habits,
      habitCheckins: checkins.habitCheckins,
      routines,
      routineModes: modes.routineModes,
      routineModeOverrides: overrides.routineModeOverrides,
      tasks,
    },
    migrated:
      migrated ||
      !Array.isArray(raw.habits) ||
      !Array.isArray(raw.routines) ||
      !Array.isArray(raw.tasks) ||
      !Array.isArray(raw.habitCheckins),
  };
}

function migrateLegacyPlannerData(
  raw: Record<string, unknown>,
  seed: PlannerData,
): { data: PlannerData; migrated: boolean } {
  const legacyRoutines = normalizeLegacyRoutines(getArray(raw, "routines"));
  const legacyTemplates = normalizeLegacyTemplates(getArray(raw, "routineTaskTemplates"));
  const legacyItems = normalizeLegacyItems(getArray(raw, "routineItems"), legacyTemplates);
  const legacySets = normalizeLegacyRoutineSets(getArray(raw, "routineSets"), legacyRoutines);
  const legacyRules = normalizeLegacyAssignmentRules(getArray(raw, "routineAssignmentRules"), legacySets);
  const legacyOverrides = normalizeLegacyDateOverrides(getArray(raw, "routineDateOverrides"), legacySets);
  const habits: Habit[] = [];
  const habitCheckins: HabitCheckin[] = [];
  const itemToHabitId = new Map<string, string>();
  const timestamp = new Date(0).toISOString();

  legacyItems.forEach((item, index) => {
    const routine = legacyRoutines.find((entry) => entry.id === item.routineId);
    const template = legacyTemplates.find((entry) => entry.id === item.templateId);
    const trackingType = template?.trackingType ?? item.trackingType;
    const startDate = getLegacyHabitStartDate(raw, item.id, routine?.createdAt ?? timestamp);
    const habit: Habit = {
      id: item.id,
      name: template?.title ?? item.title ?? `Habit ${index + 1}`,
      emoji: routine?.emoji ?? null,
      color: normalizeColorValue(routine?.color ?? "#16a34a"),
      tag: null,
      trackingType,
      targetCount: trackingType === "time" ? 1 : template?.targetCount ?? item.targetCount,
      startDate,
      sortOrder: index + 1,
      createdAt: template?.createdAt ?? routine?.createdAt ?? timestamp,
      updatedAt: template?.updatedAt ?? routine?.updatedAt ?? timestamp,
    };
    habits.push(habit);
    itemToHabitId.set(item.id, habit.id);
  });

  const unlinkedTemplates = legacyTemplates.filter(
    (template) => !legacyItems.some((item) => item.templateId === template.id),
  );
  unlinkedTemplates.forEach((template, index) => {
    habits.push({
      id: template.id,
      name: template.title,
      emoji: null,
      color: "#64748b",
      tag: null,
      trackingType: template.trackingType,
      targetCount: template.trackingType === "time" ? 1 : template.targetCount,
      startDate: template.createdAt.slice(0, 10),
      sortOrder: habits.length + index + 1,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  });

  for (const checkin of normalizeLegacyCheckins(getArray(raw, "routineCheckins"))) {
    for (const [itemId, value] of Object.entries(checkin.itemProgress)) {
      const habitId = itemToHabitId.get(itemId);
      if (!habitId) {
        continue;
      }
      const habit = habits.find((entry) => entry.id === habitId);
      if (!habit || habit.trackingType === "time") {
        continue;
      }
      habitCheckins.push({
        date: checkin.date,
        habitId,
        value,
        timeEntries: [],
        updatedAt: checkin.updatedAt,
      });
    }
  }

  const routines: Routine[] = legacyRoutines.map((routine) => ({
    id: routine.id,
    name: routine.name,
    emoji: routine.emoji,
    color: routine.color,
    habitIds: legacyItems
      .filter((item) => item.routineId === routine.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => item.id),
    notificationEnabled: false,
    notificationTime: null,
    notificationWeekdays: [],
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
  }));

  const routineModes = buildRoutineModesFromLegacy(legacySets, legacyRules, routines, habits);
  const routineModeOverrides: RoutineModeOverride[] = legacyOverrides.map((entry) => ({
    date: entry.date,
    modeId: entry.setId,
    updatedAt: entry.updatedAt,
  }));
  const tasks = normalizeLegacyTasks(getArray(raw, "todos"));

  return {
    data: {
      habits: habits.length > 0 ? habits : seed.habits,
      habitCheckins,
      routines,
      routineModes: routineModes.length > 0 ? routineModes : createDefaultRoutineModes(habits, routines),
      routineModeOverrides,
      tasks,
    },
    migrated: true,
  };
}

function getLegacyHabitStartDate(raw: Record<string, unknown>, itemId: string, fallbackTimestamp: string): string {
  const checkins = normalizeLegacyCheckins(getArray(raw, "routineCheckins"))
    .filter((entry) => Object.prototype.hasOwnProperty.call(entry.itemProgress, itemId))
    .map((entry) => entry.date)
    .sort();
  return checkins[0] ?? fallbackTimestamp.slice(0, 10);
}

function normalizeHabits(entries: unknown[]): Habit[] {
  return entries
    .filter(isRecord)
    .map((entry, index) => {
      const trackingType = normalizeTrackingTypeValue(entry.trackingType);
      return {
        id: getString(entry, "id", `habit-${index + 1}`),
        name: getString(entry, "name", `Habit ${index + 1}`),
        emoji: getNullableString(entry, "emoji"),
        color: normalizeColorValue(getString(entry, "color", "#16a34a")),
        tag: getNullableString(entry, "tag"),
        trackingType,
        targetCount: getTargetCount(entry.targetCount, trackingType),
        startDate: getDateString(entry, "startDate", "1970-01-01"),
        sortOrder: getPositiveInteger(entry, "sortOrder", index + 1),
        createdAt: getTimestamp(entry, "createdAt"),
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function normalizeHabitCheckins(
  entries: unknown[],
  habits: Habit[],
): { habitCheckins: HabitCheckin[]; migrated: boolean } {
  const habitMap = new Map(habits.map((habit) => [habit.id, habit]));
  let migrated = false;

  const habitCheckins = entries
    .filter(isRecord)
    .map((entry) => {
      const habitId = getString(entry, "habitId", "");
      const habit = habitMap.get(habitId);
      if (!habit) {
        return null;
      }

      const rawValue =
        typeof entry.value === "number" && Number.isFinite(entry.value) ? Math.trunc(entry.value) : 0;
      const rawTimeEntries = Array.isArray(entry.timeEntries) ? entry.timeEntries : [];
      const normalized = normalizeStoredHabitCheckin(
        {
          value: rawValue,
          timeEntries: rawTimeEntries,
        },
        habit,
      );

      if (habit.trackingType === "time") {
        if (!Array.isArray(entry.timeEntries) || rawValue !== normalized.value) {
          migrated = true;
        }
      } else if (Array.isArray(entry.timeEntries) && entry.timeEntries.length > 0) {
        migrated = true;
      }

      return {
        date: getDateString(entry, "date", "1970-01-01"),
        habitId,
        value: normalized.value,
        timeEntries: normalized.timeEntries,
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    })
    .filter((entry): entry is HabitCheckin => entry !== null);

  return { habitCheckins, migrated };
}

function normalizeRoutines(entries: unknown[], habits: Habit[]): Routine[] {
  const allowedHabitIds = habits.map((habit) => habit.id);
  return entries
    .filter(isRecord)
    .map((entry, index) => ({
      id: getString(entry, "id", `routine-${index + 1}`),
      name: getString(entry, "name", `Routine ${index + 1}`),
      emoji: getNullableString(entry, "emoji"),
      color: getNullableString(entry, "color"),
      habitIds: sanitizeStringArray(entry.habitIds, allowedHabitIds),
      notificationEnabled: getBoolean(entry, "notificationEnabled", false),
      notificationTime: normalizeTimeString(getNullableString(entry, "notificationTime")),
      notificationWeekdays: normalizeDays(entry.notificationWeekdays),
      createdAt: getTimestamp(entry, "createdAt"),
      updatedAt: getTimestamp(entry, "updatedAt"),
    }));
}

function normalizeRoutineModes(
  entries: unknown[],
  habits: Habit[],
  routines: Routine[],
): { routineModes: RoutineMode[]; migrated: boolean } {
  const allowedHabitIds = habits.map((habit) => habit.id);
  const allowedRoutineIds = routines.map((routine) => routine.id);
  let migrated = false;

  const routineModes = entries
    .filter(isRecord)
    .map((entry, index) => {
      if (!Array.isArray(entry.routineIds) || !Array.isArray(entry.habitIds) || !Array.isArray(entry.activeDays)) {
        migrated = true;
      }
      return {
        id: getString(entry, "id", `mode-${index + 1}`),
        name: getString(entry, "name", `Mode ${index + 1}`),
        routineIds: sanitizeStringArray(entry.routineIds, allowedRoutineIds),
        habitIds: sanitizeStringArray(entry.habitIds, allowedHabitIds),
        activeDays: normalizeDays(entry.activeDays),
        createdAt: getTimestamp(entry, "createdAt"),
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    })
    .filter((mode) => mode.activeDays.length > 0);

  if (routineModes.length > 0) {
    return { routineModes, migrated };
  }

  return {
    routineModes: createDefaultRoutineModes(habits, routines),
    migrated: true,
  };
}

function normalizeRoutineModeOverrides(
  entries: unknown[],
  routineModes: RoutineMode[],
): { routineModeOverrides: RoutineModeOverride[]; migrated: boolean } {
  const allowedModeIds = new Set(routineModes.map((mode) => mode.id));
  const byDate = new Map<string, RoutineModeOverride>();
  let migrated = false;

  for (const entry of entries.filter(isRecord)) {
    const date = getDateString(entry, "date", "1970-01-01");
    const rawModeId = typeof entry.modeId === "string" && entry.modeId.trim() ? entry.modeId : null;
    const modeId = rawModeId && allowedModeIds.has(rawModeId) ? rawModeId : null;
    if (rawModeId !== modeId) {
      migrated = true;
    }
    byDate.set(date, {
      date,
      modeId,
      updatedAt: getTimestamp(entry, "updatedAt"),
    });
  }

  return {
    routineModeOverrides: [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
    migrated,
  };
}

function normalizeTasks(entries: unknown[]): Task[] {
  return entries
    .filter(isRecord)
    .map((entry, index) => {
      const status = entry.status === "done" ? "done" : "pending";
      return {
        id: getString(entry, "id", `task-${index + 1}`),
        title: getString(entry, "title", `Task ${index + 1}`),
        emoji: getNullableString(entry, "emoji"),
        note: getNullableString(entry, "note"),
        dueDate: getNullableDateString(entry, "dueDate"),
        status,
        completedAt: status === "done" ? getNullableString(entry, "completedAt") : null,
        createdAt: getTimestamp(entry, "createdAt"),
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    });
}

function normalizeLegacyRoutines(entries: unknown[]) {
  return entries
    .filter(isRecord)
    .map((entry, index) => ({
      id: getString(entry, "id", `routine-${index + 1}`),
      name: getString(entry, "name", `Routine ${index + 1}`),
      emoji: getNullableString(entry, "emoji"),
      color: normalizeColorValue(getString(entry, "color", "#16a34a")),
      createdAt: getTimestamp(entry, "createdAt"),
      updatedAt: getTimestamp(entry, "updatedAt"),
    }));
}

function normalizeLegacyTemplates(entries: unknown[]) {
  return entries
    .filter(isRecord)
    .map((entry, index) => {
      const trackingType = normalizeTrackingTypeValue(entry.trackingType);
      return {
        id: getString(entry, "id", `template-${index + 1}`),
        title: getString(entry, "title", `Habit ${index + 1}`),
        trackingType,
        targetCount: getTargetCount(entry.targetCount, trackingType),
        createdAt: getTimestamp(entry, "createdAt"),
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    });
}

function normalizeLegacyItems(
  entries: unknown[],
  templates: Array<{ id: string; title: string; trackingType: TrackingType; targetCount: number }>,
) {
  return entries
    .filter(isRecord)
    .map((entry, index) => {
      const trackingType = normalizeTrackingTypeValue(entry.trackingType);
      const templateId = getString(entry, "templateId", getString(entry, "id", `item-${index + 1}`));
      const template = templates.find((candidate) => candidate.id === templateId);
      return {
        id: getString(entry, "id", `item-${index + 1}`),
        routineId: getString(entry, "routineId", ""),
        templateId,
        title: getString(entry, "title", template?.title ?? `Habit ${index + 1}`),
        trackingType: template?.trackingType ?? trackingType,
        targetCount: template?.targetCount ?? getTargetCount(entry.targetCount, trackingType),
        sortOrder: getPositiveInteger(entry, "sortOrder", index + 1),
      };
    })
    .filter((entry) => entry.routineId !== "");
}

function normalizeLegacyCheckins(entries: unknown[]) {
  return entries
    .filter(isRecord)
    .map((entry) => ({
      date: getDateString(entry, "date", "1970-01-01"),
      routineId: getString(entry, "routineId", ""),
      itemProgress: isRecord(entry.itemProgress)
        ? normalizeLegacyProgress(entry.itemProgress)
        : normalizeLegacyCompletedItems(entry.completedItemIds),
      updatedAt: getTimestamp(entry, "updatedAt"),
    }))
    .filter((entry) => entry.routineId !== "");
}

function normalizeLegacyRoutineSets(
  entries: unknown[],
  routines: Array<{ id: string }>,
) {
  const allowedRoutineIds = new Set(routines.map((routine) => routine.id));
  return entries
    .filter(isRecord)
    .map((entry, index) => ({
      id: getString(entry, "id", `set-${index + 1}`),
      name: getString(entry, "name", `Mode ${index + 1}`),
      routineIds: sanitizeStringArray(entry.routineIds, [...allowedRoutineIds]),
      createdAt: getTimestamp(entry, "createdAt"),
      updatedAt: getTimestamp(entry, "updatedAt"),
    }));
}

function normalizeLegacyAssignmentRules(
  entries: unknown[],
  sets: Array<{ id: string }>,
) {
  const allowedSetIds = new Set(sets.map((entry) => entry.id));
  return entries
    .filter(isRecord)
    .map((entry, index) => ({
      id: getString(entry, "id", `rule-${index + 1}`),
      ruleType: getString(entry, "ruleType", "custom"),
      days: normalizeDays(entry.days),
      setId: getString(entry, "setId", ""),
      createdAt: getTimestamp(entry, "createdAt"),
      updatedAt: getTimestamp(entry, "updatedAt"),
    }))
    .filter((entry) => allowedSetIds.has(entry.setId));
}

function normalizeLegacyDateOverrides(
  entries: unknown[],
  sets: Array<{ id: string }>,
) {
  const allowedSetIds = new Set(sets.map((entry) => entry.id));
  return entries
    .filter(isRecord)
    .map((entry) => ({
      date: getDateString(entry, "date", getDateString(entry, "dateKey", "1970-01-01")),
      setId: getNullableString(entry, "setId"),
      updatedAt: getTimestamp(entry, "updatedAt"),
    }))
    .filter((entry) => entry.setId === null || allowedSetIds.has(entry.setId));
}

function normalizeLegacyTasks(entries: unknown[]): Task[] {
  return entries
    .filter(isRecord)
    .map((entry, index) => {
      const status = entry.status === "done" ? "done" : "pending";
      return {
        id: getString(entry, "id", `task-${index + 1}`),
        title: getString(entry, "title", `Task ${index + 1}`),
        emoji: getNullableString(entry, "emoji"),
        note: getNullableString(entry, "note"),
        dueDate: getNullableDateString(entry, "dueDate"),
        status,
        completedAt: status === "done" ? getNullableString(entry, "completedAt") : null,
        createdAt: getTimestamp(entry, "createdAt"),
        updatedAt: getTimestamp(entry, "updatedAt"),
      };
    });
}

function buildRoutineModesFromLegacy(
  sets: Array<{ id: string; name: string; routineIds: string[]; createdAt: string; updatedAt: string }>,
  rules: Array<{ setId: string; days: ActiveDay[] }>,
  routines: Routine[],
  habits: Habit[],
): RoutineMode[] {
  const routinesById = new Map(routines.map((routine) => [routine.id, routine]));

  return sets
    .map((set) => {
      const activeDays = [
        ...new Set(rules.filter((rule) => rule.setId === set.id).flatMap((rule) => rule.days)),
      ] as ActiveDay[];
      return {
        id: set.id,
        name: set.name,
        routineIds: set.routineIds.filter((routineId) => routinesById.has(routineId)),
        habitIds: [],
        activeDays: activeDays.length > 0 ? activeDays : ([0, 1, 2, 3, 4, 5, 6] as ActiveDay[]),
        createdAt: set.createdAt,
        updatedAt: set.updatedAt,
      };
    })
    .filter((mode) => mode.routineIds.length > 0 || habits.length > 0);
}

function createDefaultRoutineModes(habits: Habit[], routines: Routine[]): RoutineMode[] {
  if (habits.length === 0 && routines.length === 0) {
    return [];
  }

  const timestamp = findDefaultTimestamp(habits, routines);
  return [
    {
      id: "mode-default",
      name: "Default Mode",
      routineIds: [],
      habitIds: habits.map((habit) => habit.id),
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

function findDefaultTimestamp(habits: Habit[], routines: Routine[]): string {
  const values = [...habits.map((habit) => habit.createdAt), ...routines.map((routine) => routine.createdAt)].sort();
  return values[0] ?? new Date(0).toISOString();
}

function getNodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
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

function getDateString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function getNullableDateString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function getTargetCount(value: unknown, trackingType: TrackingType): number {
  if (trackingType === "binary") {
    return 1;
  }
  if (trackingType === "count") {
    return Number.isInteger(value) && (value as number) >= 2 ? (value as number) : 2;
  }
  return Number.isInteger(value) && (value as number) >= 1 ? (value as number) : 1;
}

function normalizeTrackingTypeValue(value: unknown): TrackingType {
  if (value === "count") return "count";
  if (value === "time") return "time";
  return "binary";
}

function normalizeColorValue(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#16a34a";
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

function normalizeDays(value: unknown): ActiveDay[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value.filter(
        (entry): entry is ActiveDay => Number.isInteger(entry) && entry >= 0 && entry <= 6,
      ),
    ),
  ];
}

function normalizeTimeString(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function normalizeLegacyProgress(raw: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, value]) => Number.isFinite(value))
      .map(([key, value]) => [key, Math.max(0, Math.trunc(value as number))]),
  );
}

function normalizeLegacyCompletedItems(rawCompletedItemIds: unknown): Record<string, number> {
  const completed = Array.isArray(rawCompletedItemIds)
    ? rawCompletedItemIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  return Object.fromEntries(completed.map((itemId) => [itemId, 1]));
}
