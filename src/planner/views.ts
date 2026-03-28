import { addDays, eachDateInRange, getDayOfWeek } from "./date.js";
import { clampProgressValue, sortTasks } from "./validation.js";
import type {
  CalendarDaySummary,
  Habit,
  HabitWithStats,
  PlannerData,
  RankedHabitStat,
  Routine,
  RoutineMode,
  RoutineModeWithDetails,
  RoutineWithHabits,
  TodayHabit,
  TodayResponse,
} from "./types.js";

export function buildHabitCollection(data: PlannerData): HabitWithStats[] {
  return sortHabits(data.habits).map((habit) => ({
    ...habit,
    currentStreak: getHabitStreak(data, habit.id),
    bestStreak: getHabitBestStreak(data, habit.id),
  }));
}

export function buildRoutineCollection(data: PlannerData): RoutineWithHabits[] {
  const habitMap = new Map(data.habits.map((habit) => [habit.id, habit]));
  return [...data.routines]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((routine) => ({
      ...routine,
      habits: routine.habitIds
        .map((habitId) => habitMap.get(habitId))
        .filter((habit): habit is Habit => habit !== undefined)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    }));
}

export function buildRoutineModeCollection(data: PlannerData): RoutineModeWithDetails[] {
  const routineMap = new Map(buildRoutineCollection(data).map((routine) => [routine.id, routine]));
  const habitMap = new Map(data.habits.map((habit) => [habit.id, habit]));

  return [...data.routineModes]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((mode) => ({
      ...mode,
      routines: mode.routineIds
        .map((routineId) => routineMap.get(routineId))
        .filter((routine): routine is RoutineWithHabits => routine !== undefined),
      habits: mode.habitIds
        .map((habitId) => habitMap.get(habitId))
        .filter((habit): habit is Habit => habit !== undefined)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    }));
}

export function buildTodayResponse(data: PlannerData, date: string): TodayResponse {
  const habits = buildTodayHabits(data, date);
  const completedHabits = habits.filter((habit) => habit.isComplete).length;
  const totalHabits = habits.length;
  const activeMode = getActiveMode(data, date);

  return {
    ok: true,
    date,
    activeMode: activeMode ? { id: activeMode.id, name: activeMode.name } : null,
    summary: {
      habitRate: totalHabits === 0 ? 0 : completedHabits / totalHabits,
      completedHabits,
      totalHabits,
      remainingHabits: totalHabits - completedHabits,
    },
    habits,
  };
}

export function buildTodayHabits(data: PlannerData, date: string): TodayHabit[] {
  return getScheduledHabits(data, date).map((habit) => buildTodayHabit(data, habit, date));
}

export function buildTodayHabit(data: PlannerData, habit: Habit, date: string): TodayHabit {
  const checkin = getHabitCheckin(data, habit.id, date);
  const timeEntries = habit.trackingType === "time" ? [...(checkin?.timeEntries ?? [])] : [];
  const currentValue = habit.trackingType === "time" ? timeEntries.length : getHabitValue(data, habit.id, date);
  const progressRate = habit.targetCount === 0 ? 0 : currentValue / habit.targetCount;
  return {
    ...habit,
    currentValue,
    isComplete: isHabitComplete(habit, currentValue),
    progressRate,
    streak: getHabitStreak(data, habit.id, date),
    timeEntries,
    latestTimeEntry: timeEntries.at(-1) ?? null,
  };
}

export function buildCalendarDay(data: PlannerData, date: string): CalendarDaySummary {
  const habits = buildTodayHabits(data, date);
  const completedHabits = habits.filter((habit) => habit.isComplete).length;
  const tasks = data.tasks.filter((task) => task.dueDate === date);
  return {
    date,
    habitProgressRate: habits.length === 0 ? 0 : completedHabits / habits.length,
    completedHabits,
    totalHabits: habits.length,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => task.status === "done").length,
  };
}

export function getRangeRate(data: PlannerData, startDate: string, endDate: string): number {
  let completed = 0;
  let total = 0;

  for (const date of eachDateInRange(startDate, endDate)) {
    const day = buildCalendarDay(data, date);
    completed += day.completedHabits;
    total += day.totalHabits;
  }

  return total === 0 ? 0 : completed / total;
}

export function getCurrentStreak(data: PlannerData, today: string): number {
  return getDatasetStreak(data, today, false);
}

export function getBestStreak(data: PlannerData, today: string): number {
  return getDatasetStreak(data, today, true);
}

export function getTopHabits(
  data: PlannerData,
  startDate: string,
  endDate: string,
): RankedHabitStat[] {
  return sortHabits(data.habits)
    .map((habit) => {
      let completedDays = 0;
      let trackedDays = 0;

      for (const date of eachDateInRange(startDate, endDate)) {
        if (!isHabitScheduledForDate(data, habit.id, date)) {
          continue;
        }
        trackedDays += 1;
        if (isHabitComplete(habit, getHabitValue(data, habit.id, date))) {
          completedDays += 1;
        }
      }

      return {
        habitId: habit.id,
        name: habit.name,
        emoji: habit.emoji,
        color: habit.color,
        completionRate: trackedDays === 0 ? 0 : completedDays / trackedDays,
        completedDays,
        trackedDays,
      };
    })
    .filter((stat) => stat.trackedDays > 0)
    .sort((left, right) => {
      if (right.completionRate !== left.completionRate) {
        return right.completionRate - left.completionRate;
      }
      if (right.completedDays !== left.completedDays) {
        return right.completedDays - left.completedDays;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, 5);
}

export function getTaskCompletion(data: PlannerData, startDate: string, endDate: string) {
  const tasks = data.tasks.filter((task) => {
    if (task.dueDate === null) {
      return false;
    }
    return task.dueDate >= startDate && task.dueDate <= endDate;
  });
  const completed = tasks.filter((task) => task.status === "done").length;
  return {
    completed,
    total: tasks.length,
    rate: tasks.length === 0 ? 0 : completed / tasks.length,
  };
}

export function getHabitValue(data: PlannerData, habitId: string, date: string): number {
  const habit = data.habits.find((entry) => entry.id === habitId);
  if (!habit) {
    return 0;
  }
  const checkin = getHabitCheckin(data, habitId, date);
  if (habit.trackingType === "time") {
    return checkin?.timeEntries.length ?? 0;
  }
  return clampProgressValue(checkin?.value ?? 0, habit.targetCount);
}

export function isHabitComplete(habit: Habit, value: number): boolean {
  return clampProgressValue(value, habit.targetCount) >= habit.targetCount;
}

export function getHabitStreak(data: PlannerData, habitId: string, endDate?: string): number {
  const habit = data.habits.find((entry) => entry.id === habitId);
  if (!habit) {
    return 0;
  }

  const latestDate =
    endDate ??
    [...data.habitCheckins.filter((checkin) => checkin.habitId === habitId).map((checkin) => checkin.date)].sort().at(-1) ??
    habit.startDate;
  let streak = 0;
  let cursor = latestDate;

  while (cursor >= habit.startDate) {
    if (!isHabitScheduledForDate(data, habit.id, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!isHabitComplete(habit, getHabitValue(data, habitId, cursor))) {
      break;
    }
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function getHabitBestStreak(data: PlannerData, habitId: string): number {
  const habit = data.habits.find((entry) => entry.id === habitId);
  if (!habit) {
    return 0;
  }

  const dates = [
    ...new Set(
      data.habitCheckins.filter((checkin) => checkin.habitId === habitId).map((checkin) => checkin.date),
    ),
  ].sort();
  if (dates.length === 0) {
    return 0;
  }

  let best = 0;
  let streak = 0;
  const endDate = dates.at(-1) ?? habit.startDate;

  for (const date of eachDateInRange(habit.startDate, endDate)) {
    if (!isHabitScheduledForDate(data, habit.id, date)) {
      continue;
    }
    if (isHabitComplete(habit, getHabitValue(data, habitId, date))) {
      streak += 1;
      best = Math.max(best, streak);
    } else {
      streak = 0;
    }
  }

  return best;
}

export function getEarliestTrackedDate(data: PlannerData): string | null {
  const dates = [
    ...data.habits.map((habit) => habit.startDate),
    ...data.habitCheckins.map((checkin) => checkin.date),
    ...data.tasks.flatMap((task) => (task.dueDate ? [task.dueDate] : [])),
    ...data.routineModeOverrides.map((override) => override.date),
  ].sort();
  return dates[0] ?? null;
}

export function sortTasksForView(data: PlannerData) {
  return [...data.tasks].sort(sortTasks);
}

export function getActiveMode(data: PlannerData, date: string): RoutineMode | null {
  const modeMap = new Map(data.routineModes.map((mode) => [mode.id, mode]));
  const override = data.routineModeOverrides.find((entry) => entry.date === date);
  if (override) {
    return override.modeId ? (modeMap.get(override.modeId) ?? null) : null;
  }

  const dayOfWeek = getDayOfWeek(date) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return (
    [...data.routineModes]
      .filter((mode) => mode.activeDays.includes(dayOfWeek))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null
  );
}

export function getScheduledHabits(data: PlannerData, date: string): Habit[] {
  const activeMode = getActiveMode(data, date);
  if (!activeMode) {
    return [];
  }

  const routineMap = new Map(data.routines.map((routine) => [routine.id, routine]));
  const scheduledIds = new Set<string>();

  for (const routineId of activeMode.routineIds) {
    const routine = routineMap.get(routineId);
    if (!routine) {
      continue;
    }
    for (const habitId of routine.habitIds) {
      scheduledIds.add(habitId);
    }
  }

  for (const habitId of activeMode.habitIds) {
    scheduledIds.add(habitId);
  }

  return sortHabits(data.habits).filter((habit) => scheduledIds.has(habit.id) && habit.startDate <= date);
}

function getHabitCheckin(data: PlannerData, habitId: string, date: string) {
  return data.habitCheckins.find((entry) => entry.habitId === habitId && entry.date === date);
}

function isHabitScheduledForDate(data: PlannerData, habitId: string, date: string) {
  return getScheduledHabits(data, date).some((habit) => habit.id === habitId);
}

function sortHabits(habits: Habit[]): Habit[] {
  return [...habits].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    if (left.startDate !== right.startDate) {
      return left.startDate.localeCompare(right.startDate);
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function getDatasetStreak(data: PlannerData, today: string, findBest: boolean) {
  const startDate = getEarliestTrackedDate(data) ?? today;
  const scheduledDates = eachDateInRange(startDate, today).filter(
    (date) => getScheduledHabits(data, date).length > 0,
  );
  let streak = 0;
  let best = 0;

  for (const date of scheduledDates) {
    const habits = buildTodayHabits(data, date);
    const allComplete = habits.length > 0 && habits.every((habit) => habit.isComplete);
    if (allComplete) {
      streak += 1;
      best = Math.max(best, streak);
    } else {
      if (!findBest && date === today) {
        streak = 0;
        break;
      }
      streak = 0;
    }
  }

  return findBest ? best : streak;
}

function isRoutineVisible(routine: Routine, date: string, data: PlannerData) {
  const activeMode = getActiveMode(data, date);
  return Boolean(activeMode?.routineIds.includes(routine.id));
}

void isRoutineVisible;
