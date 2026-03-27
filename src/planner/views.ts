import { addDays, eachDateInRange } from "./date.js";
import { clampProgressValue, sortTasks } from "./validation.js";
import type {
  CalendarDaySummary,
  Habit,
  HabitWithStats,
  PlannerData,
  RankedHabitStat,
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

export function buildTodayResponse(data: PlannerData, date: string): TodayResponse {
  const habits = buildTodayHabits(data, date);
  const completedHabits = habits.filter((habit) => habit.isComplete).length;
  const totalHabits = habits.length;

  return {
    ok: true,
    date,
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
  return sortHabits(data.habits)
    .filter((habit) => habit.startDate <= date)
    .map((habit) => buildTodayHabit(data, habit, date));
}

export function buildTodayHabit(data: PlannerData, habit: Habit, date: string): TodayHabit {
  const currentValue = getHabitValue(data, habit.id, date);
  const progressRate = habit.targetCount === 0 ? 0 : currentValue / habit.targetCount;
  return {
    ...habit,
    currentValue,
    isComplete: isHabitComplete(habit, currentValue),
    progressRate,
    streak: getHabitStreak(data, habit.id, date),
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
        if (habit.startDate > date) {
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
  const checkin = data.habitCheckins.find((entry) => entry.habitId === habitId && entry.date === date);
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
  let cursor = habit.startDate;
  const endDate = dates.at(-1) ?? habit.startDate;
  for (const date of eachDateInRange(habit.startDate, endDate)) {
    if (isHabitComplete(habit, getHabitValue(data, habitId, date))) {
      streak += 1;
      best = Math.max(best, streak);
    } else {
      streak = 0;
    }
    cursor = date;
  }

  void cursor;
  return best;
}

export function getEarliestTrackedDate(data: PlannerData): string | null {
  const dates = [
    ...data.habits.map((habit) => habit.startDate),
    ...data.habitCheckins.map((checkin) => checkin.date),
    ...data.tasks.flatMap((task) => (task.dueDate ? [task.dueDate] : [])),
  ].sort();
  return dates[0] ?? null;
}

export function sortTasksForView(data: PlannerData) {
  return [...data.tasks].sort(sortTasks);
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
    (date) => buildTodayHabits(data, date).length > 0,
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
