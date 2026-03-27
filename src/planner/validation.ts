import type {
  ActiveDay,
  AssignmentRuleType,
  PlannerData,
  RoutineCheckin,
  RoutineItem,
  ResolvedRoutineItem,
  Todo,
  TrackingType,
} from "./types.js";
import { isValidDateKey } from "./date.js";

export class PlannerValidationError extends Error {}

export function validateDateKey(value: string | undefined, label: string): asserts value is string {
  if (typeof value !== "string" || !isValidDateKey(value)) {
    throw new PlannerValidationError(`${label} must use YYYY-MM-DD format`);
  }
}

export function requireText(value: string, label: string): string {
  const text = value.trim();
  if (!text) {
    throw new PlannerValidationError(`${label} is required`);
  }
  return text;
}

export function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const text = value.trim();
  return text === "" ? null : text;
}

export function normalizeOptionalEmoji(value: string | null): string | null {
  const text = normalizeOptionalText(value);
  if (text === null) {
    return null;
  }
  if (Array.from(text).length > 16) {
    throw new PlannerValidationError("emoji must be 16 characters or fewer");
  }
  return text;
}

export function normalizeColor(value: string): string {
  const color = requireText(value, "Routine color");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new PlannerValidationError("Routine color must use #RRGGBB format");
  }
  return color;
}

export function normalizeOptionalDate(value: string | null, label: string): string | null {
  if (value === null || value === "") {
    return null;
  }
  validateDateKey(value, label);
  return value;
}

export function normalizeTodoStatus(value: string): "pending" | "done" {
  if (value !== "pending" && value !== "done") {
    throw new PlannerValidationError("Todo status must be pending or done");
  }
  return value;
}

export function normalizeTrackingType(value: TrackingType): TrackingType {
  if (value !== "binary" && value !== "count" && value !== "time") {
    throw new PlannerValidationError("trackingType must be binary, count, or time");
  }
  return value;
}

export function normalizeTargetCount(
  trackingType: TrackingType,
  targetCount: number | undefined,
): number {
  if (trackingType === "binary") {
    return 1;
  }
  if (trackingType === "count" && (!Number.isInteger(targetCount) || (targetCount ?? 0) < 2)) {
    throw new PlannerValidationError("count items require targetCount of at least 2");
  }
  if (trackingType === "time" && (!Number.isInteger(targetCount) || (targetCount ?? 0) < 1)) {
    throw new PlannerValidationError("time items require targetCount of at least 1 minute");
  }
  return targetCount as number;
}

export function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new PlannerValidationError(`${label} must be a positive integer`);
  }
  return value;
}

export function sanitizeIds<T extends string>(values: T[], allowedIds: string[]): T[] {
  const allowed = new Set(allowedIds);
  const unique = [...new Set(values)];
  for (const value of unique) {
    if (!allowed.has(value)) {
      throw new PlannerValidationError(`Unknown reference: ${value}`);
    }
  }
  return unique;
}

export function sanitizeDays(days: number[]): ActiveDay[] {
  return [...new Set(days)].map((day) => {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new PlannerValidationError("days must contain values 0-6");
    }
    return day as ActiveDay;
  });
}

export function normalizeRuleType(ruleType: AssignmentRuleType): AssignmentRuleType {
  if (ruleType !== "weekday" && ruleType !== "weekend" && ruleType !== "custom-days") {
    throw new PlannerValidationError("Invalid assignment rule type");
  }
  return ruleType;
}

export function normalizeRuleDays(ruleType: AssignmentRuleType, days?: number[]): ActiveDay[] {
  if (ruleType === "weekday") {
    return [1, 2, 3, 4, 5];
  }
  if (ruleType === "weekend") {
    return [0, 6];
  }
  if (!Array.isArray(days) || days.length === 0) {
    throw new PlannerValidationError("custom-days rules require at least one day");
  }
  return sanitizeDays(days);
}

export function normalizeRoutineIds(routineIds: string[], data: PlannerData): string[] {
  if (!Array.isArray(routineIds)) {
    throw new PlannerValidationError("routineIds must be an array");
  }
  return sanitizeIds(routineIds, data.routines.map((entry) => entry.id));
}

export function normalizeRoutineTaskTemplateIds(
  templateIds: string[],
  data: Pick<PlannerData, "routineTaskTemplates">,
): string[] {
  if (!Array.isArray(templateIds)) {
    throw new PlannerValidationError("taskTemplateIds must be an array");
  }
  return sanitizeIds(
    templateIds,
    data.routineTaskTemplates.filter((entry) => !entry.isArchived).map((entry) => entry.id),
  );
}

export function requireExistingSetId(setId: string, data: PlannerData): string {
  if (!data.routineSets.some((routineSet) => routineSet.id === setId)) {
    throw new PlannerValidationError("Referenced routine set was not found");
  }
  return setId;
}

export function normalizeExistingSetIdOrNull(setId: string | null, data: PlannerData): string | null {
  if (setId === null || setId === "") {
    return null;
  }
  return requireExistingSetId(setId, data);
}

export function clampProgressValue(value: number, targetCount: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(normalized, 0), targetCount);
}

export function normalizeStoredItemProgress(
  rawProgress: Record<string, number>,
  items: ResolvedRoutineItem[],
): Record<string, number> {
  const progress: Record<string, number> = {};
  for (const item of items) {
    progress[item.id] = clampProgressValue(rawProgress[item.id] ?? 0, item.targetCount);
  }
  return progress;
}

export function normalizeCheckinsForRoutineItems(
  checkins: RoutineCheckin[],
  routineItems: ResolvedRoutineItem[],
  routineId: string,
) {
  const items = routineItems.filter((item) => item.routineId === routineId && item.isActive);
  for (const checkin of checkins.filter((entry) => entry.routineId === routineId)) {
    checkin.itemProgress = normalizeStoredItemProgress(checkin.itemProgress, items);
  }
}

export function normalizeRoutineItemOrder(items: RoutineItem[], routineId: string) {
  items
    .filter((item) => item.routineId === routineId)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .forEach((item, index) => {
      item.sortOrder = index + 1;
    });
}

export function sortTodos(left: Todo, right: Todo): number {
  const leftKey = left.dueDate ?? "9999-12-31";
  const rightKey = right.dueDate ?? "9999-12-31";
  if (left.status !== right.status) {
    return left.status === "pending" ? -1 : 1;
  }
  if (leftKey !== rightKey) {
    return leftKey.localeCompare(rightKey);
  }
  return left.createdAt.localeCompare(right.createdAt);
}
