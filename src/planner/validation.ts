import type {
  ActiveDay,
  Habit,
  HabitCheckin,
  PlannerData,
  Task,
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
  const text = String(value ?? "").trim();
  if (!text) {
    throw new PlannerValidationError(`${label} is required`);
  }
  return text;
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function normalizeOptionalEmoji(value: string | null | undefined): string | null {
  const text = normalizeOptionalText(value);
  if (text === null) {
    return null;
  }
  if (Array.from(text).length > 16) {
    throw new PlannerValidationError("emoji must be 16 characters or fewer");
  }
  return text;
}

export function normalizeColor(value: string, label = "color"): string {
  const color = requireText(value, label);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new PlannerValidationError(`${label} must use #RRGGBB format`);
  }
  return color;
}

export function normalizeOptionalDate(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  validateDateKey(value, label);
  return value;
}

export function normalizeTrackingType(value: TrackingType | undefined): TrackingType {
  if (value === "count" || value === "time" || value === "binary") {
    return value;
  }
  throw new PlannerValidationError("trackingType must be binary, count, or time");
}

export function normalizeTargetCount(
  trackingType: TrackingType,
  targetCount: number | undefined,
): number {
  if (trackingType === "binary") {
    return 1;
  }
  if (trackingType === "count") {
    if (!Number.isInteger(targetCount) || (targetCount ?? 0) < 2) {
      throw new PlannerValidationError("count habits require targetCount of at least 2");
    }
    return targetCount as number;
  }
  if (!Number.isInteger(targetCount) || (targetCount ?? 0) < 1) {
    throw new PlannerValidationError("time habits require targetCount of at least 1 minute");
  }
  return targetCount as number;
}

export function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new PlannerValidationError(`${label} must be a positive integer`);
  }
  return value;
}

export function normalizeTaskStatus(value: string): "pending" | "done" {
  if (value !== "pending" && value !== "done") {
    throw new PlannerValidationError("Task status must be pending or done");
  }
  return value;
}

export function normalizeNotificationTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const text = String(value).trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    throw new PlannerValidationError("notificationTime must use HH:MM format");
  }
  const [hours, minutes] = text.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new PlannerValidationError("notificationTime must use a valid 24-hour time");
  }
  return text;
}

export function normalizeWeekdays(days: number[] | undefined): ActiveDay[] {
  if (!Array.isArray(days)) {
    return [];
  }
  return [...new Set(days)].map((day) => {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new PlannerValidationError("notificationWeekdays must contain values 0-6");
    }
    return day as ActiveDay;
  });
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

export function normalizeHabitIds(habitIds: string[], data: Pick<PlannerData, "habits">): string[] {
  if (!Array.isArray(habitIds)) {
    throw new PlannerValidationError("habitIds must be an array");
  }
  return sanitizeIds(habitIds, data.habits.map((habit) => habit.id));
}

export function clampProgressValue(value: number, targetCount: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(normalized, 0), targetCount);
}

export function normalizeStoredHabitValue(value: number, habit: Habit): number {
  return clampProgressValue(value, habit.targetCount);
}

export function normalizeCheckinsForHabits(checkins: HabitCheckin[], habits: Habit[]) {
  const habitMap = new Map(habits.map((habit) => [habit.id, habit]));
  return checkins
    .filter((checkin) => habitMap.has(checkin.habitId))
    .map((checkin) => ({
      ...checkin,
      value: normalizeStoredHabitValue(checkin.value, habitMap.get(checkin.habitId)!),
    }));
}

export function sortTasks(left: Task, right: Task): number {
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
