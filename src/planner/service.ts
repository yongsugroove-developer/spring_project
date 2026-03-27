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
  buildRoutineCollection,
  buildRoutineSetCollection,
  buildRoutineSetWithMeta,
  buildTodayRoutine,
  buildTodayRoutines,
  buildTodayResponse,
  createEmptyOverride,
  getBestStreak,
  getCurrentStreak,
  getRangeRate,
  getRoutineItems,
  getTodoCompletion,
  getTopRoutines,
  resolveAssignment,
} from "./views.js";
import {
  PlannerValidationError,
  normalizeCheckinsForRoutineItems,
  normalizeColor,
  normalizeOptionalEmoji,
  normalizeExistingSetIdOrNull,
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizePositiveInteger,
  normalizeRoutineIds,
  normalizeRoutineItemOrder,
  normalizeRoutineTaskTemplateIds,
  normalizeRuleDays,
  normalizeRuleType,
  normalizeStoredItemProgress,
  normalizeTargetCount,
  normalizeTodoStatus,
  normalizeTrackingType,
  requireExistingSetId,
  requireText,
  sanitizeIds,
  validateDateKey,
} from "./validation.js";
import type {
  AssignmentRuleType,
  AssignmentsResponse,
  CheckinsResponse,
  OverrideResponse,
  Routine,
  RoutineCheckin,
  RoutineDateOverride,
  RoutineItem,
  RoutineSet,
  RoutineSetsResponse,
  RoutineTaskTemplate,
  RoutineTaskTemplatesResponse,
  RoutinesResponse,
  StatsResponse,
  Todo,
  TodosResponse,
  TrackingType,
} from "./types.js";
import type { PlannerRepository } from "./repository.js";

export { PlannerValidationError } from "./validation.js";

export interface PlannerServiceOptions {
  now?: () => Date;
}

interface RoutineInput {
  name: string;
  emoji?: string | null;
  color: string;
  taskTemplateIds?: string[];
}

interface RoutineTaskTemplateInput {
  title: string;
  trackingType?: TrackingType;
  targetCount?: number;
  isArchived?: boolean;
}

interface RoutineItemInput {
  title: string;
  trackingType?: TrackingType;
  targetCount?: number;
  sortOrder?: number;
}

interface RoutineSetInput {
  name: string;
  routineIds: string[];
}

interface AssignmentRuleInput {
  ruleType: AssignmentRuleType;
  days?: number[];
  setId: string;
}

interface OverrideInput {
  setId?: string | null;
  includeRoutineIds?: string[];
  excludeRoutineIds?: string[];
}

interface CheckinInput {
  itemProgress?: Record<string, number>;
  completedItemIds?: string[];
}

interface TodoInput {
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

  async listRoutines(): Promise<RoutinesResponse> {
    const data = await this.repository.read();
    return { ok: true, routines: buildRoutineCollection(data) };
  }

  async listRoutineTaskTemplates(): Promise<RoutineTaskTemplatesResponse> {
    const data = await this.repository.read();
    return {
      ok: true,
      routineTaskTemplates: [...data.routineTaskTemplates].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      ),
    };
  }

  async createRoutineTaskTemplate(input: RoutineTaskTemplateInput) {
    const data = await this.repository.read();
    const template = this.buildRoutineTaskTemplate(input);
    data.routineTaskTemplates.push(template);
    await this.repository.write(data);
    return template;
  }

  async updateRoutineTaskTemplate(
    templateId: string,
    input: Partial<RoutineTaskTemplateInput>,
  ) {
    const data = await this.repository.read();
    const template = data.routineTaskTemplates.find((entry) => entry.id === templateId);
    if (!template) {
      return null;
    }

    const nextTrackingType = input.trackingType
      ? normalizeTrackingType(input.trackingType)
      : template.trackingType;

    if (input.title !== undefined) {
      template.title = requireText(input.title, "Routine task template title");
    }
    if (input.trackingType !== undefined) {
      template.trackingType = nextTrackingType;
    }
    if (input.targetCount !== undefined || input.trackingType !== undefined) {
      template.targetCount = normalizeTargetCount(
        nextTrackingType,
        input.targetCount ?? template.targetCount,
      );
    }
    if (typeof input.isArchived === "boolean") {
      template.isArchived = input.isArchived;
    }

    template.updatedAt = this.now().toISOString();
    await this.repository.write(data);
    return template;
  }

  async deleteRoutineTaskTemplate(templateId: string): Promise<boolean> {
    const data = await this.repository.read();
    if (data.routineItems.some((entry) => entry.templateId === templateId)) {
      throw new PlannerValidationError("Cannot delete a task template that is used by a routine");
    }

    const nextTemplates = data.routineTaskTemplates.filter((entry) => entry.id !== templateId);
    if (nextTemplates.length === data.routineTaskTemplates.length) {
      return false;
    }

    data.routineTaskTemplates = nextTemplates;
    await this.repository.write(data);
    return true;
  }

  async createRoutine(input: RoutineInput) {
    const data = await this.repository.read();
    const timestamp = this.now().toISOString();
    const taskTemplateIds =
      input.taskTemplateIds !== undefined
        ? normalizeRoutineTaskTemplateIds(input.taskTemplateIds, data)
        : [];
    const routine: Routine = {
      id: randomUUID(),
      name: requireText(input.name, "Routine name"),
      emoji: normalizeOptionalEmoji(input.emoji ?? null),
      color: normalizeColor(input.color),
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    data.routines.push(routine);
    data.routineItems.push(
      ...taskTemplateIds.map((templateId, index) => ({
        id: randomUUID(),
        routineId: routine.id,
        templateId,
        sortOrder: index + 1,
        isActive: true,
      })),
    );
    await this.repository.write(data);
    return buildRoutineCollection(data).find((entry) => entry.id === routine.id) ?? null;
  }

  async updateRoutine(
    routineId: string,
    input: Partial<RoutineInput> & { isArchived?: boolean },
  ) {
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
      routine.color = normalizeColor(input.color);
    }
    if (typeof input.isArchived === "boolean") {
      routine.isArchived = input.isArchived;
    }
    if (input.taskTemplateIds !== undefined) {
      const taskTemplateIds = normalizeRoutineTaskTemplateIds(input.taskTemplateIds, data);
      data.routineItems = data.routineItems.filter((entry) => entry.routineId !== routineId);
      data.routineItems.push(
        ...taskTemplateIds.map((templateId, index) => ({
          id: randomUUID(),
          routineId,
          templateId,
          sortOrder: index + 1,
          isActive: true,
        })),
      );
      normalizeCheckinsForRoutineItems(data.routineCheckins, getRoutineItems(data, routineId), routineId);
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
    data.routineItems = data.routineItems.filter((entry) => entry.routineId !== routineId);
    data.routineCheckins = data.routineCheckins.filter((entry) => entry.routineId !== routineId);
    data.routineSets = data.routineSets.map((set) => ({
      ...set,
      routineIds: set.routineIds.filter((entry) => entry !== routineId),
      updatedAt: this.now().toISOString(),
    }));
    data.routineDateOverrides = data.routineDateOverrides.map((override) => ({
      ...override,
      includeRoutineIds: override.includeRoutineIds.filter((entry) => entry !== routineId),
      excludeRoutineIds: override.excludeRoutineIds.filter((entry) => entry !== routineId),
      updatedAt: this.now().toISOString(),
    }));
    await this.repository.write(data);
    return true;
  }

  async addRoutineItem(routineId: string, input: RoutineItemInput) {
    const data = await this.repository.read();
    const routine = data.routines.find((entry) => entry.id === routineId);
    if (!routine) {
      return null;
    }

    const template = this.buildRoutineTaskTemplate(input);
    data.routineTaskTemplates.push(template);
    const item = this.createRoutineItemLink(data.routineItems, routineId, template.id, input.sortOrder);

    data.routineItems.push(item);
    normalizeRoutineItemOrder(data.routineItems, routineId);
    routine.updatedAt = this.now().toISOString();
    await this.repository.write(data);
    return getRoutineItems(data, routineId).find((entry) => entry.id === item.id) ?? null;
  }

  async updateRoutineItem(
    routineId: string,
    itemId: string,
    input: Partial<RoutineItemInput> & { isActive?: boolean },
  ) {
    const data = await this.repository.read();
    const item = data.routineItems.find(
      (entry) => entry.routineId === routineId && entry.id === itemId,
    );
    const routine = data.routines.find((entry) => entry.id === routineId);
    if (!item || !routine) {
      return null;
    }

    const resolvedItem = getRoutineItems(data, routineId).find((entry) => entry.id === itemId);
    if (!resolvedItem) {
      return null;
    }

    if (input.sortOrder !== undefined) {
      item.sortOrder = normalizePositiveInteger(input.sortOrder, "sortOrder");
    }
    if (typeof input.isActive === "boolean") {
      item.isActive = input.isActive;
    }

    if (
      input.title !== undefined ||
      input.trackingType !== undefined ||
      input.targetCount !== undefined
    ) {
      const currentTemplate = data.routineTaskTemplates.find((entry) => entry.id === item.templateId);
      const nextTrackingType = normalizeTrackingType(input.trackingType ?? resolvedItem.trackingType);
      const nextTitle = requireText(input.title ?? resolvedItem.title, "Routine item title");
      const nextTargetCount = normalizeTargetCount(
        nextTrackingType,
        input.targetCount ?? resolvedItem.targetCount,
      );
      const templateUsage = data.routineItems.filter((entry) => entry.templateId === item.templateId).length;

      if (currentTemplate && templateUsage === 1) {
        currentTemplate.title = nextTitle;
        currentTemplate.trackingType = nextTrackingType;
        currentTemplate.targetCount = nextTargetCount;
        currentTemplate.updatedAt = this.now().toISOString();
      } else {
        const template = this.buildRoutineTaskTemplate({
          title: nextTitle,
          trackingType: nextTrackingType,
          targetCount: nextTargetCount,
        });
        data.routineTaskTemplates.push(template);
        item.templateId = template.id;
      }
    }

    normalizeRoutineItemOrder(data.routineItems, routineId);
    normalizeCheckinsForRoutineItems(data.routineCheckins, getRoutineItems(data, routineId), routineId);
    routine.updatedAt = this.now().toISOString();
    await this.repository.write(data);
    return getRoutineItems(data, routineId).find((entry) => entry.id === itemId) ?? null;
  }

  async deleteRoutineItem(routineId: string, itemId: string): Promise<boolean> {
    const data = await this.repository.read();
    const nextItems = data.routineItems.filter(
      (entry) => !(entry.routineId === routineId && entry.id === itemId),
    );
    if (nextItems.length === data.routineItems.length) {
      return false;
    }

    data.routineItems = nextItems;
    for (const checkin of data.routineCheckins.filter((entry) => entry.routineId === routineId)) {
      delete checkin.itemProgress[itemId];
    }
    normalizeRoutineItemOrder(data.routineItems, routineId);
    await this.repository.write(data);
    return true;
  }

  async listRoutineSets(): Promise<RoutineSetsResponse> {
    const data = await this.repository.read();
    return { ok: true, routineSets: buildRoutineSetCollection(data) };
  }

  async createRoutineSet(input: RoutineSetInput) {
    const data = await this.repository.read();
    const timestamp = this.now().toISOString();
    const routineSet: RoutineSet = {
      id: randomUUID(),
      name: requireText(input.name, "Routine set name"),
      routineIds: normalizeRoutineIds(input.routineIds, data),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    data.routineSets.push(routineSet);
    await this.repository.write(data);
    return buildRoutineSetWithMeta(data, routineSet);
  }

  async updateRoutineSet(setId: string, input: Partial<RoutineSetInput>) {
    const data = await this.repository.read();
    const routineSet = data.routineSets.find((entry) => entry.id === setId);
    if (!routineSet) {
      return null;
    }

    if (input.name !== undefined) {
      routineSet.name = requireText(input.name, "Routine set name");
    }
    if (input.routineIds !== undefined) {
      routineSet.routineIds = normalizeRoutineIds(input.routineIds, data);
    }

    routineSet.updatedAt = this.now().toISOString();
    await this.repository.write(data);
    return buildRoutineSetWithMeta(data, routineSet);
  }

  async deleteRoutineSet(setId: string): Promise<boolean> {
    const data = await this.repository.read();
    const nextSets = data.routineSets.filter((entry) => entry.id !== setId);
    if (nextSets.length === data.routineSets.length) {
      return false;
    }

    data.routineSets = nextSets;
    data.routineAssignmentRules = data.routineAssignmentRules.filter((entry) => entry.setId !== setId);
    data.routineDateOverrides = data.routineDateOverrides.map((override) => ({
      ...override,
      setId: override.setId === setId ? null : override.setId,
      updatedAt: this.now().toISOString(),
    }));
    await this.repository.write(data);
    return true;
  }

  async getAssignments(): Promise<AssignmentsResponse> {
    const data = await this.repository.read();
    return { ok: true, assignments: [...data.routineAssignmentRules] };
  }

  async replaceAssignments(inputs: AssignmentRuleInput[]): Promise<AssignmentsResponse> {
    const data = await this.repository.read();
    const timestamp = this.now().toISOString();
    data.routineAssignmentRules = inputs.map((input) => ({
      id: randomUUID(),
      ruleType: normalizeRuleType(input.ruleType),
      days: normalizeRuleDays(input.ruleType, input.days),
      setId: requireExistingSetId(input.setId, data),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    await this.repository.write(data);
    return { ok: true, assignments: [...data.routineAssignmentRules] };
  }

  async getOverride(date: string): Promise<OverrideResponse> {
    validateDateKey(date, "date");
    const data = await this.repository.read();
    const override =
      data.routineDateOverrides.find((entry) => entry.date === date) ?? createEmptyOverride(date);
    return {
      ok: true,
      date,
      override,
      resolvedAssignment: resolveAssignment(data, date),
    };
  }

  async upsertOverride(date: string, input: OverrideInput): Promise<OverrideResponse> {
    validateDateKey(date, "date");
    const data = await this.repository.read();
    const normalizedOverride: RoutineDateOverride = {
      date,
      setId: normalizeExistingSetIdOrNull(input.setId ?? null, data),
      includeRoutineIds: normalizeRoutineIds(input.includeRoutineIds ?? [], data),
      excludeRoutineIds: normalizeRoutineIds(input.excludeRoutineIds ?? [], data),
      updatedAt: this.now().toISOString(),
    };
    assertNoOverlap(
      normalizedOverride.includeRoutineIds,
      normalizedOverride.excludeRoutineIds,
      "Override routines",
    );

    const isEmpty =
      normalizedOverride.setId === null &&
      normalizedOverride.includeRoutineIds.length === 0 &&
      normalizedOverride.excludeRoutineIds.length === 0;

    data.routineDateOverrides = data.routineDateOverrides.filter((entry) => entry.date !== date);
    if (!isEmpty) {
      data.routineDateOverrides.push(normalizedOverride);
    }
    await this.repository.write(data);
    return {
      ok: true,
      date,
      override: isEmpty ? createEmptyOverride(date) : normalizedOverride,
      resolvedAssignment: resolveAssignment(data, date),
    };
  }

  async getCheckins(date: string): Promise<CheckinsResponse> {
    validateDateKey(date, "date");
    const data = await this.repository.read();
    const assignment = resolveAssignment(data, date);
    return {
      ok: true,
      date,
      assignment,
      routines: buildTodayRoutines(data, date, assignment),
    };
  }

  async upsertCheckin(date: string, routineId: string, input: CheckinInput) {
    validateDateKey(date, "date");
    const data = await this.repository.read();
    const routine = data.routines.find((entry) => entry.id === routineId && !entry.isArchived);
    if (!routine) {
      return null;
    }

    const items = getRoutineItems(data, routineId).filter((entry) => entry.isActive);
    const normalizedProgress = normalizeCheckinInput(input, items);
    const timestamp = this.now().toISOString();
    const existing = data.routineCheckins.find(
      (entry) => entry.date === date && entry.routineId === routineId,
    );

    if (existing) {
      existing.itemProgress = normalizedProgress;
      existing.updatedAt = timestamp;
    } else {
      const checkin: RoutineCheckin = {
        date,
        routineId,
        itemProgress: normalizedProgress,
        updatedAt: timestamp,
      };
      data.routineCheckins.push(checkin);
    }

    await this.repository.write(data);
    return buildTodayRoutine(data, routine, date);
  }

  async listTodos(): Promise<TodosResponse> {
    const data = await this.repository.read();
    return { ok: true, todos: [...data.todos] };
  }

  async createTodo(input: TodoInput): Promise<Todo> {
    const data = await this.repository.read();
    const timestamp = this.now().toISOString();
    const status = normalizeTodoStatus(input.status ?? "pending");
    const todo: Todo = {
      id: randomUUID(),
      title: requireText(input.title, "Todo title"),
      emoji: normalizeOptionalEmoji(input.emoji ?? null),
      note: normalizeOptionalText(input.note ?? null),
      dueDate: normalizeOptionalDate(input.dueDate ?? null, "Todo dueDate"),
      status,
      completedAt: status === "done" ? timestamp : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    data.todos.push(todo);
    await this.repository.write(data);
    return todo;
  }

  async updateTodo(todoId: string, input: Partial<TodoInput>) {
    const data = await this.repository.read();
    const todo = data.todos.find((entry) => entry.id === todoId);
    if (!todo) {
      return null;
    }

    if (input.title !== undefined) {
      todo.title = requireText(input.title, "Todo title");
    }
    if (input.emoji !== undefined) {
      todo.emoji = normalizeOptionalEmoji(input.emoji);
    }
    if (input.note !== undefined) {
      todo.note = normalizeOptionalText(input.note);
    }
    if (input.dueDate !== undefined) {
      todo.dueDate = normalizeOptionalDate(input.dueDate, "Todo dueDate");
    }
    if (input.status !== undefined) {
      const nextStatus = normalizeTodoStatus(input.status);
      if (nextStatus === "done") {
        todo.completedAt =
          todo.status === "done"
            ? (todo.completedAt ?? this.now().toISOString())
            : this.now().toISOString();
      } else {
        todo.completedAt = null;
      }
      todo.status = nextStatus;
    }

    todo.updatedAt = this.now().toISOString();
    await this.repository.write(data);
    return todo;
  }

  async deleteTodo(todoId: string): Promise<boolean> {
    const data = await this.repository.read();
    const nextTodos = data.todos.filter((entry) => entry.id !== todoId);
    if (nextTodos.length === data.todos.length) {
      return false;
    }

    data.todos = nextTodos;
    await this.repository.write(data);
    return true;
  }

  async getCalendar(month: string) {
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
        topRoutines: getTopRoutines(data, selectedBounds.startDate, selectedBounds.endDate),
        todoCompletion: getTodoCompletion(data, selectedBounds.startDate, selectedBounds.endDate),
      },
    };
  }

  private buildRoutineTaskTemplate(
    input: RoutineTaskTemplateInput,
  ): RoutineTaskTemplate {
    const timestamp = this.now().toISOString();
    const trackingType = normalizeTrackingType(input.trackingType ?? "binary");
    return {
      id: randomUUID(),
      title: requireText(input.title, "Routine task template title"),
      trackingType,
      targetCount: normalizeTargetCount(trackingType, input.targetCount),
      isArchived: Boolean(input.isArchived),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private createRoutineItemLink(
    items: RoutineItem[],
    routineId: string,
    templateId: string,
    sortOrder?: number,
  ): RoutineItem {
    const currentOrders = items
      .filter((entry) => entry.routineId === routineId)
      .map((entry) => entry.sortOrder);
    const nextOrder = currentOrders.length === 0 ? 1 : Math.max(...currentOrders) + 1;

    return {
      id: randomUUID(),
      routineId,
      templateId,
      sortOrder: sortOrder ? normalizePositiveInteger(sortOrder, "sortOrder") : nextOrder,
      isActive: true,
    };
  }
}

function normalizeCheckinInput(
  input: CheckinInput,
  items: ReturnType<typeof getRoutineItems>,
) {
  if (input.itemProgress && typeof input.itemProgress === "object") {
    return normalizeStoredItemProgress(input.itemProgress, items);
  }

  const completedItemIds = Array.isArray(input.completedItemIds)
    ? sanitizeIds(input.completedItemIds, items.map((item) => item.id))
    : [];
  const progress = Object.fromEntries(items.map((item) => [item.id, 0]));

  for (const item of items) {
    if (completedItemIds.includes(item.id)) {
      progress[item.id] = item.trackingType === "binary" ? 1 : item.targetCount;
    }
  }

  return progress;
}

function getCustomBounds(startDate?: string, endDate?: string) {
  validateDateKey(startDate, "start");
  validateDateKey(endDate, "end");
  if (startDate > endDate) {
    throw new PlannerValidationError("start must be on or before end");
  }
  return { startDate, endDate };
}

function assertNoOverlap(leftIds: string[], rightIds: string[], label: string) {
  const right = new Set(rightIds);
  const overlap = leftIds.filter((entry) => right.has(entry));
  if (overlap.length > 0) {
    throw new PlannerValidationError(
      `${label} cannot include the same routine in includeRoutineIds and excludeRoutineIds`,
    );
  }
}
