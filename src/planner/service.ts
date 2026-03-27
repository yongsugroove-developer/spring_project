import { randomUUID } from "node:crypto";
import {
  eachDateInRange,
  formatMonthKey,
  getMonthBounds,
  getTodayKey,
  getWeekBounds,
  isValidMonthKey,
} from "./date.js";
import {
  buildCalendarDay,
  buildHabitCollection,
  buildRoutineCollection,
  buildTodayHabit,
  buildTodayHabits,
  buildTodayResponse,
  getBestStreak,
  getCurrentStreak,
  getRangeRate,
  getTaskCompletion,
  getTopHabits,
} from "./views.js";
import {
  PlannerValidationError,
  normalizeColor,
  normalizeHabitIds,
  normalizeNotificationTime,
  normalizeOptionalDate,
  normalizeOptionalEmoji,
  normalizeOptionalText,
  normalizePositiveInteger,
  normalizeStoredHabitValue,
  normalizeTargetCount,
  normalizeTaskStatus,
  normalizeTrackingType,
  normalizeWeekdays,
  requireText,
  sanitizeIds,
  validateDateKey,
} from "./validation.js";
import type {
  CalendarResponse,
  Habit,
  HabitCheckinsResponse,
  HabitsResponse,
  Routine,
  RoutinesResponse,
  StatsResponse,
  Task,
  TasksResponse,
  TrackingType,
} from "./types.js";
import type { PlannerRepository } from "./repository.js";

export { PlannerValidationError } from "./validation.js";

export interface PlannerServiceOptions {
  now?: () => Date;
}

interface HabitInput {
  name: string;
  emoji?: string | null;
  color?: string;
  tag?: string | null;
  trackingType?: TrackingType;
  targetCount?: number;
  startDate?: string | null;
  sortOrder?: number;
}

interface HabitReorderInput {
  habitIds: string[];
}

interface HabitCheckinInput {
  value?: number;
  completed?: boolean;
}

interface RoutineInput {
  name: string;
  emoji?: string | null;
  color?: string | null;
  habitIds?: string[];
  notificationEnabled?: boolean;
  notificationTime?: string | null;
  notificationWeekdays?: number[];
}

interface TaskInput {
  title: string;
  emoji?: string | null;
  note?: string | null;
  dueDate?: string | null;
  status?: "pending" | "done";
}

export class PlannerService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: PlannerRepository,
    options: PlannerServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async getToday(date?: string) {
    if (date !== undefined) {
      validateDateKey(date, "date");
    }
    const resolvedDate = date ?? getTodayKey(this.now());
    const data = await this.repository.read();
    return buildTodayResponse(data, resolvedDate);
  }

  async listHabits(): Promise<HabitsResponse> {
    const data = await this.repository.read();
    return { ok: true, habits: buildHabitCollection(data) };
  }

  async createHabit(input: HabitInput) {
    const data = await this.repository.read();
    const habit = this.buildHabit(input, data.habits.length + 1);
    data.habits.push(habit);
    data.habits = sortHabits(data.habits);
    await this.repository.write(data);
    return habit;
  }

  async updateHabit(habitId: string, input: Partial<HabitInput>) {
    const data = await this.repository.read();
    const habit = data.habits.find((entry) => entry.id === habitId);
    if (!habit) {
      return null;
    }

    const nextTrackingType =
      input.trackingType !== undefined ? normalizeTrackingType(input.trackingType) : habit.trackingType;

    if (input.name !== undefined) {
      habit.name = requireText(input.name, "Habit name");
    }
    if (input.emoji !== undefined) {
      habit.emoji = normalizeOptionalEmoji(input.emoji);
    }
    if (input.color !== undefined) {
      habit.color = normalizeColor(input.color, "Habit color");
    }
    if (input.tag !== undefined) {
      habit.tag = normalizeOptionalText(input.tag);
    }
    if (input.trackingType !== undefined) {
      habit.trackingType = nextTrackingType;
    }
    if (input.targetCount !== undefined || input.trackingType !== undefined) {
      habit.targetCount = normalizeTargetCount(nextTrackingType, input.targetCount ?? habit.targetCount);
    }
    if (input.startDate !== undefined) {
      habit.startDate =
        normalizeOptionalDate(input.startDate, "Habit startDate") ?? getTodayKey(this.now());
    }
    if (input.sortOrder !== undefined) {
      habit.sortOrder = normalizePositiveInteger(input.sortOrder, "sortOrder");
    }

    habit.updatedAt = this.now().toISOString();
    data.habits = sortHabits(data.habits);
    data.habitCheckins = data.habitCheckins.map((checkin) =>
      checkin.habitId === habit.id
        ? {
            ...checkin,
            value: normalizeStoredHabitValue(checkin.value, habit),
          }
        : checkin,
    );
    await this.repository.write(data);
    return habit;
  }

  async deleteHabit(habitId: string): Promise<boolean> {
    const data = await this.repository.read();
    const nextHabits = data.habits.filter((entry) => entry.id !== habitId);
    if (nextHabits.length === data.habits.length) {
      return false;
    }

    data.habits = nextHabits.map((habit, index) => ({
      ...habit,
      sortOrder: index + 1,
    }));
    data.habitCheckins = data.habitCheckins.filter((entry) => entry.habitId !== habitId);
    data.routines = data.routines.map((routine) => ({
      ...routine,
      habitIds: routine.habitIds.filter((entry) => entry !== habitId),
      updatedAt: this.now().toISOString(),
    }));
    await this.repository.write(data);
    return true;
  }

  async reorderHabits(input: HabitReorderInput) {
    const data = await this.repository.read();
    const orderedIds = sanitizeIds(input.habitIds, data.habits.map((habit) => habit.id));
    if (orderedIds.length !== data.habits.length) {
      throw new PlannerValidationError("habitIds must include every saved habit exactly once");
    }

    const orderMap = new Map(orderedIds.map((habitId, index) => [habitId, index + 1]));
    data.habits = data.habits
      .map((habit) => ({
        ...habit,
        sortOrder: orderMap.get(habit.id) ?? habit.sortOrder,
        updatedAt: this.now().toISOString(),
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder);

    await this.repository.write(data);
    return { ok: true, habits: buildHabitCollection(data) };
  }

  async getHabitCheckins(date: string): Promise<HabitCheckinsResponse> {
    validateDateKey(date, "date");
    const data = await this.repository.read();
    return {
      ok: true,
      date,
      habits: buildTodayHabits(data, date),
    };
  }

  async upsertHabitCheckin(date: string, habitId: string, input: HabitCheckinInput) {
    validateDateKey(date, "date");
    const data = await this.repository.read();
    const habit = data.habits.find((entry) => entry.id === habitId);
    if (!habit) {
      return null;
    }

    const value =
      typeof input.value === "number"
        ? normalizeStoredHabitValue(input.value, habit)
        : input.completed === true
          ? habit.targetCount
          : input.completed === false
            ? 0
            : undefined;

    if (value === undefined) {
      throw new PlannerValidationError("Habit checkin requires value or completed");
    }

    const timestamp = this.now().toISOString();
    const existing = data.habitCheckins.find(
      (entry) => entry.date === date && entry.habitId === habitId,
    );

    if (existing) {
      existing.value = value;
      existing.updatedAt = timestamp;
    } else {
      data.habitCheckins.push({
        date,
        habitId,
        value,
        updatedAt: timestamp,
      });
    }

    await this.repository.write(data);
    return buildTodayHabit(data, habit, date);
  }

  async listRoutines(): Promise<RoutinesResponse> {
    const data = await this.repository.read();
    return { ok: true, routines: buildRoutineCollection(data) };
  }

  async createRoutine(input: RoutineInput) {
    const data = await this.repository.read();
    const timestamp = this.now().toISOString();
    const routine: Routine = {
      id: randomUUID(),
      name: requireText(input.name, "Routine name"),
      emoji: normalizeOptionalEmoji(input.emoji ?? null),
      color: input.color ? normalizeColor(input.color, "Routine color") : null,
      habitIds: normalizeHabitIds(input.habitIds ?? [], data),
      notificationEnabled: Boolean(input.notificationEnabled),
      notificationTime: normalizeNotificationTime(input.notificationTime ?? null),
      notificationWeekdays: normalizeWeekdays(input.notificationWeekdays),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    data.routines.push(routine);
    await this.repository.write(data);
    return buildRoutineCollection(data).find((entry) => entry.id === routine.id) ?? null;
  }

  async updateRoutine(routineId: string, input: Partial<RoutineInput>) {
    const data = await this.repository.read();
    const routine = data.routines.find((entry) => entry.id === routineId);
    if (!routine) {
      return null;
    }

    if (input.name !== undefined) {
      routine.name = requireText(input.name, "Routine name");
    }
    if (input.emoji !== undefined) {
      routine.emoji = normalizeOptionalEmoji(input.emoji);
    }
    if (input.color !== undefined) {
      routine.color = input.color ? normalizeColor(input.color, "Routine color") : null;
    }
    if (input.habitIds !== undefined) {
      routine.habitIds = normalizeHabitIds(input.habitIds, data);
    }
    if (input.notificationEnabled !== undefined) {
      routine.notificationEnabled = Boolean(input.notificationEnabled);
    }
    if (input.notificationTime !== undefined) {
      routine.notificationTime = normalizeNotificationTime(input.notificationTime);
    }
    if (input.notificationWeekdays !== undefined) {
      routine.notificationWeekdays = normalizeWeekdays(input.notificationWeekdays);
    }

    routine.updatedAt = this.now().toISOString();
    await this.repository.write(data);
    return buildRoutineCollection(data).find((entry) => entry.id === routine.id) ?? null;
  }

  async deleteRoutine(routineId: string): Promise<boolean> {
    const data = await this.repository.read();
    const nextRoutines = data.routines.filter((entry) => entry.id !== routineId);
    if (nextRoutines.length === data.routines.length) {
      return false;
    }

    data.routines = nextRoutines;
    await this.repository.write(data);
    return true;
  }

  async listTasks(): Promise<TasksResponse> {
    const data = await this.repository.read();
    return { ok: true, tasks: [...data.tasks] };
  }

  async createTask(input: TaskInput): Promise<Task> {
    const data = await this.repository.read();
    const timestamp = this.now().toISOString();
    const status = normalizeTaskStatus(input.status ?? "pending");
    const task: Task = {
      id: randomUUID(),
      title: requireText(input.title, "Task title"),
      emoji: normalizeOptionalEmoji(input.emoji ?? null),
      note: normalizeOptionalText(input.note ?? null),
      dueDate: normalizeOptionalDate(input.dueDate ?? null, "Task dueDate"),
      status,
      completedAt: status === "done" ? timestamp : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    data.tasks.push(task);
    await this.repository.write(data);
    return task;
  }

  async updateTask(taskId: string, input: Partial<TaskInput>) {
    const data = await this.repository.read();
    const task = data.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return null;
    }

    if (input.title !== undefined) {
      task.title = requireText(input.title, "Task title");
    }
    if (input.emoji !== undefined) {
      task.emoji = normalizeOptionalEmoji(input.emoji);
    }
    if (input.note !== undefined) {
      task.note = normalizeOptionalText(input.note);
    }
    if (input.dueDate !== undefined) {
      task.dueDate = normalizeOptionalDate(input.dueDate, "Task dueDate");
    }
    if (input.status !== undefined) {
      const nextStatus = normalizeTaskStatus(input.status);
      if (nextStatus === "done") {
        task.completedAt =
          task.status === "done" ? (task.completedAt ?? this.now().toISOString()) : this.now().toISOString();
      } else {
        task.completedAt = null;
      }
      task.status = nextStatus;
    }

    task.updatedAt = this.now().toISOString();
    await this.repository.write(data);
    return task;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const data = await this.repository.read();
    const nextTasks = data.tasks.filter((entry) => entry.id !== taskId);
    if (nextTasks.length === data.tasks.length) {
      return false;
    }

    data.tasks = nextTasks;
    await this.repository.write(data);
    return true;
  }

  async getCalendar(month: string): Promise<CalendarResponse> {
    if (!isValidMonthKey(month)) {
      throw new PlannerValidationError("month must use YYYY-MM format");
    }

    const data = await this.repository.read();
    const { startDate, endDate } = getMonthBounds(month);
    return {
      ok: true,
      month,
      days: eachDateInRange(startDate, endDate).map((date) => buildCalendarDay(data, date)),
    };
  }

  async getStats(
    range: "week" | "month" | "custom",
    customStartDate?: string,
    customEndDate?: string,
  ): Promise<StatsResponse> {
    const today = getTodayKey(this.now());
    const weekBounds = { startDate: getWeekBounds(today).startDate, endDate: today };
    const monthBounds = {
      startDate: getMonthBounds(formatMonthKey(this.now())).startDate,
      endDate: today,
    };
    const selectedBounds =
      range === "week"
        ? weekBounds
        : range === "month"
          ? monthBounds
          : getCustomBounds(customStartDate, customEndDate);
    const data = await this.repository.read();

    return {
      ok: true,
      range,
      startDate: selectedBounds.startDate,
      endDate: selectedBounds.endDate,
      summary: {
        dailyRate: getRangeRate(data, today, today),
        weeklyRate: getRangeRate(data, weekBounds.startDate, weekBounds.endDate),
        monthlyRate: getRangeRate(data, monthBounds.startDate, monthBounds.endDate),
        currentStreak: getCurrentStreak(data, today),
        bestStreak: getBestStreak(data, today),
        topHabits: getTopHabits(data, selectedBounds.startDate, selectedBounds.endDate),
        taskCompletion: getTaskCompletion(data, selectedBounds.startDate, selectedBounds.endDate),
      },
    };
  }

  private buildHabit(input: HabitInput, fallbackOrder: number): Habit {
    const timestamp = this.now().toISOString();
    const trackingType = normalizeTrackingType(input.trackingType ?? "binary");
    return {
      id: randomUUID(),
      name: requireText(input.name, "Habit name"),
      emoji: normalizeOptionalEmoji(input.emoji ?? null),
      color: normalizeColor(input.color ?? "#16a34a", "Habit color"),
      tag: normalizeOptionalText(input.tag ?? null),
      trackingType,
      targetCount: normalizeTargetCount(trackingType, input.targetCount),
      startDate: normalizeOptionalDate(input.startDate ?? null, "Habit startDate") ?? getTodayKey(this.now()),
      sortOrder:
        input.sortOrder !== undefined
          ? normalizePositiveInteger(input.sortOrder, "sortOrder")
          : fallbackOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}

function sortHabits(habits: Habit[]) {
  return [...habits]
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.createdAt.localeCompare(right.createdAt);
    })
    .map((habit, index) => ({
      ...habit,
      sortOrder: index + 1,
    }));
}

function getCustomBounds(startDate?: string, endDate?: string) {
  validateDateKey(startDate, "start");
  validateDateKey(endDate, "end");
  if (startDate > endDate) {
    throw new PlannerValidationError("start must be on or before end");
  }
  return { startDate, endDate };
}
