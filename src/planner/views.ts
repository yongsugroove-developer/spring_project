import { eachDateInRange, getDayOfWeek } from "./date.js";
import { clampProgressValue, sanitizeIds, sortTodos } from "./validation.js";
import type {
  ActiveDay,
  CalendarDaySummary,
  PlannerData,
  RankedRoutineStat,
  ResolvedAssignment,
  Routine,
  RoutineDateOverride,
  RoutineItem,
  RoutineItemState,
  RoutineSet,
  RoutineSetWithMeta,
  TodayResponse,
  TodayRoutine,
} from "./types.js";

export function buildRoutineCollection(data: PlannerData) {
  return [...data.routines]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((routine) => buildRoutineWithItems(data, routine));
}

export function buildRoutineWithItems(data: PlannerData, routine: Routine) {
  return {
    ...routine,
    items: getRoutineItems(data, routine.id),
  };
}

export function buildRoutineSetCollection(data: PlannerData): RoutineSetWithMeta[] {
  return [...data.routineSets]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((routineSet) => buildRoutineSetWithMeta(data, routineSet));
}

export function buildRoutineSetWithMeta(data: PlannerData, routineSet: RoutineSet): RoutineSetWithMeta {
  return {
    ...routineSet,
    routines: routineSet.routineIds
      .map((routineId) => data.routines.find((routine) => routine.id === routineId))
      .filter((routine): routine is Routine => routine !== undefined),
  };
}

export function getRoutineItems(data: PlannerData, routineId: string): RoutineItem[] {
  return data.routineItems
    .filter((item) => item.routineId === routineId)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({ ...item }));
}

export function createEmptyOverride(date: string): RoutineDateOverride {
  return {
    date,
    setId: null,
    includeRoutineIds: [],
    excludeRoutineIds: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function resolveAssignment(data: PlannerData, date: string): ResolvedAssignment {
  const override = data.routineDateOverrides.find((entry) => entry.date === date);
  const baseSetFromRule = resolveRuleSet(data, date);
  const baseSetId = override?.setId ?? baseSetFromRule?.id ?? null;
  const baseSet = baseSetId
    ? data.routineSets.find((routineSet) => routineSet.id === baseSetId) ?? null
    : null;
  const includeRoutineIds = sanitizeIds(
    override?.includeRoutineIds ?? [],
    data.routines.map((entry) => entry.id),
  );
  const excludeRoutineIds = sanitizeIds(
    override?.excludeRoutineIds ?? [],
    data.routines.map((entry) => entry.id),
  );
  const activeRoutineIds = new Set(baseSet?.routineIds ?? []);

  for (const routineId of includeRoutineIds) {
    activeRoutineIds.add(routineId);
  }
  for (const routineId of excludeRoutineIds) {
    activeRoutineIds.delete(routineId);
  }
  const hasOverride =
    override !== undefined &&
    (override.setId !== null ||
      override.includeRoutineIds.length > 0 ||
      override.excludeRoutineIds.length > 0);

  return {
    date,
    baseSetId: baseSet?.id ?? null,
    baseSetName: baseSet?.name ?? null,
    source: hasOverride ? "override" : baseSet ? "rule" : "none",
    includeRoutineIds,
    excludeRoutineIds,
    activeRoutineIds: [...activeRoutineIds],
  };
}

export function buildTodayResponse(data: PlannerData, date: string): TodayResponse {
  const assignment = resolveAssignment(data, date);
  const routines = buildTodayRoutines(data, date, assignment);
  const dueToday = data.todos.filter((todo) => todo.dueDate === date);
  const inbox = data.todos.filter((todo) => todo.dueDate === null && todo.status === "pending");
  const completedUnits = routines.reduce((sum, routine) => sum + routine.progress.completedUnits, 0);
  const targetUnits = routines.reduce((sum, routine) => sum + routine.progress.targetUnits, 0);
  const completedItemCount = routines.reduce(
    (sum, routine) => sum + routine.progress.completedItemCount,
    0,
  );
  const totalItemCount = routines.reduce((sum, routine) => sum + routine.progress.totalItemCount, 0);

  return {
    ok: true,
    date,
    assignment,
    summary: {
      routineRate: targetUnits === 0 ? 0 : completedUnits / targetUnits,
      completedUnits,
      targetUnits,
      completedItemCount,
      totalItemCount,
      dueTodayCount: dueToday.filter((todo) => todo.status === "pending").length,
      inboxCount: inbox.length,
      completedTodoCount: data.todos.filter((todo) => todo.status === "done").length,
    },
    routines,
    todos: {
      dueToday: [...dueToday].sort(sortTodos),
      inbox: [...inbox].sort(sortTodos),
    },
  };
}

export function buildTodayRoutines(
  data: PlannerData,
  date: string,
  assignment: ResolvedAssignment = resolveAssignment(data, date),
): TodayRoutine[] {
  return assignment.activeRoutineIds
    .map((routineId) => data.routines.find((routine) => routine.id === routineId))
    .filter((routine): routine is Routine => routine !== undefined)
    .filter((routine) => !routine.isArchived && routine.createdAt.slice(0, 10) <= date)
    .map((routine) => buildTodayRoutine(data, routine, date));
}

export function buildTodayRoutine(data: PlannerData, routine: Routine, date: string): TodayRoutine {
  const progress = getRoutineProgress(data, routine.id, date);
  return {
    ...routine,
    items: progress.itemStates,
    progress,
  };
}

export function getRoutineProgress(data: PlannerData, routineId: string, date: string) {
  const items = getRoutineItems(data, routineId).filter((item) => item.isActive);
  const checkin = data.routineCheckins.find(
    (entry) => entry.routineId === routineId && entry.date === date,
  );
  const itemStates: RoutineItemState[] = items.map((item) => {
    const rawCount = checkin?.itemProgress[item.id] ?? 0;
    const currentCount = clampProgressValue(rawCount, item.targetCount);
    const progressRate = item.targetCount === 0 ? 0 : currentCount / item.targetCount;
    return {
      ...item,
      currentCount,
      isComplete: currentCount >= item.targetCount,
      progressRate,
    };
  });

  const completedUnits = itemStates.reduce((sum, item) => sum + item.currentCount, 0);
  const targetUnits = itemStates.reduce((sum, item) => sum + item.targetCount, 0);
  const completedItemCount = itemStates.filter((item) => item.isComplete).length;

  return {
    itemStates,
    completedUnits,
    targetUnits,
    completedItemCount,
    totalItemCount: itemStates.length,
    rate: targetUnits === 0 ? 0 : completedUnits / targetUnits,
  };
}

export function buildCalendarDay(data: PlannerData, date: string): CalendarDaySummary {
  const assignment = resolveAssignment(data, date);
  const routines = buildTodayRoutines(data, date, assignment);
  const completedUnits = routines.reduce((sum, routine) => sum + routine.progress.completedUnits, 0);
  const targetUnits = routines.reduce((sum, routine) => sum + routine.progress.targetUnits, 0);
  const todos = data.todos.filter((todo) => todo.dueDate === date);

  return {
    date,
    routineProgressRate: targetUnits === 0 ? 0 : completedUnits / targetUnits,
    completedUnits,
    targetUnits,
    todoCount: todos.length,
    completedTodoCount: todos.filter((todo) => todo.status === "done").length,
    setId: assignment.baseSetId,
    setName: assignment.baseSetName,
    overrideApplied: data.routineDateOverrides.some((entry) => entry.date === date),
  };
}

export function getRangeRate(data: PlannerData, startDate: string, endDate: string): number {
  let completedUnits = 0;
  let targetUnits = 0;

  for (const date of eachDateInRange(startDate, endDate)) {
    const day = buildCalendarDay(data, date);
    completedUnits += day.completedUnits;
    targetUnits += day.targetUnits;
  }

  return targetUnits === 0 ? 0 : completedUnits / targetUnits;
}

export function getCurrentStreak(data: PlannerData, today: string): number {
  const startDate = getEarliestTrackedDate(data) ?? today;
  const scheduledDates = eachDateInRange(startDate, today).filter(
    (date) => buildCalendarDay(data, date).targetUnits > 0,
  );
  let streak = 0;

  for (let index = scheduledDates.length - 1; index >= 0; index -= 1) {
    const day = buildCalendarDay(data, scheduledDates[index]);
    if (day.completedUnits === day.targetUnits && day.targetUnits > 0) {
      streak += 1;
      continue;
    }
    break;
  }

  return streak;
}

export function getBestStreak(data: PlannerData, today: string): number {
  const startDate = getEarliestTrackedDate(data) ?? today;
  const scheduledDates = eachDateInRange(startDate, today).filter(
    (date) => buildCalendarDay(data, date).targetUnits > 0,
  );
  let best = 0;
  let streak = 0;

  for (const date of scheduledDates) {
    const day = buildCalendarDay(data, date);
    if (day.completedUnits === day.targetUnits && day.targetUnits > 0) {
      streak += 1;
      best = Math.max(best, streak);
      continue;
    }
    streak = 0;
  }

  return best;
}

export function getTopRoutines(data: PlannerData, startDate: string, endDate: string): RankedRoutineStat[] {
  return data.routines
    .filter((routine) => !routine.isArchived)
    .map((routine) => {
      let completedUnits = 0;
      let targetUnits = 0;

      for (const date of eachDateInRange(startDate, endDate)) {
        const assignment = resolveAssignment(data, date);
        if (!assignment.activeRoutineIds.includes(routine.id) || routine.createdAt.slice(0, 10) > date) {
          continue;
        }

        const progress = getRoutineProgress(data, routine.id, date);
        completedUnits += progress.completedUnits;
        targetUnits += progress.targetUnits;
      }

      return {
        routineId: routine.id,
        name: routine.name,
        emoji: routine.emoji,
        color: routine.color,
        completionRate: targetUnits === 0 ? 0 : completedUnits / targetUnits,
        completedUnits,
        targetUnits,
      };
    })
    .filter((stat) => stat.targetUnits > 0)
    .sort((left, right) => {
      if (right.completionRate !== left.completionRate) {
        return right.completionRate - left.completionRate;
      }
      return right.completedUnits - left.completedUnits;
    })
    .slice(0, 5);
}

export function getTodoCompletion(data: PlannerData, startDate: string, endDate: string) {
  const todos = data.todos.filter((todo) => {
    if (todo.dueDate === null) {
      return false;
    }
    return todo.dueDate >= startDate && todo.dueDate <= endDate;
  });
  const completed = todos.filter((todo) => todo.status === "done").length;
  return {
    completed,
    total: todos.length,
    rate: todos.length === 0 ? 0 : completed / todos.length,
  };
}

export function getEarliestTrackedDate(data: PlannerData): string | null {
  const dates = [
    ...data.routineCheckins.map((entry) => entry.date),
    ...data.routineDateOverrides.map((entry) => entry.date),
    ...data.todos.flatMap((entry) => (entry.dueDate ? [entry.dueDate] : [])),
  ].sort();
  return dates[0] ?? null;
}

function resolveRuleSet(data: PlannerData, date: string): RoutineSet | null {
  const day = getDayOfWeek(date) as ActiveDay;
  const customRule = data.routineAssignmentRules.find(
    (rule) => rule.ruleType === "custom-days" && rule.days.includes(day),
  );
  if (customRule) {
    return data.routineSets.find((routineSet) => routineSet.id === customRule.setId) ?? null;
  }

  const defaultRule = data.routineAssignmentRules.find(
    (rule) =>
      (rule.ruleType === "weekday" || rule.ruleType === "weekend") && rule.days.includes(day),
  );
  if (!defaultRule) {
    return null;
  }

  return data.routineSets.find((routineSet) => routineSet.id === defaultRule.setId) ?? null;
}
