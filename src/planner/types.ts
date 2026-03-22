export type ActiveDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TrackingType = "binary" | "count" | "time";

export interface Routine {
  id: string;
  name: string;
  color: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineItem {
  id: string;
  routineId: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  trackingType: TrackingType;
  targetCount: number;
}

export interface RoutineCheckin {
  date: string;
  routineId: string;
  itemProgress: Record<string, number>;
  updatedAt: string;
}

export interface RoutineSet {
  id: string;
  name: string;
  routineIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type AssignmentRuleType = "weekday" | "weekend" | "custom-days";

export interface RoutineAssignmentRule {
  id: string;
  ruleType: AssignmentRuleType;
  days: ActiveDay[];
  setId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineDateOverride {
  date: string;
  setId: string | null;
  includeRoutineIds: string[];
  excludeRoutineIds: string[];
  updatedAt: string;
}

export type TodoStatus = "pending" | "done";

export interface Todo {
  id: string;
  title: string;
  note: string | null;
  dueDate: string | null;
  status: TodoStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerData {
  routines: Routine[];
  routineItems: RoutineItem[];
  routineCheckins: RoutineCheckin[];
  routineSets: RoutineSet[];
  routineAssignmentRules: RoutineAssignmentRule[];
  routineDateOverrides: RoutineDateOverride[];
  todos: Todo[];
}

export interface RoutineItemState extends RoutineItem {
  currentCount: number;
  isComplete: boolean;
  progressRate: number;
}

export interface RoutineProgress {
  itemStates: RoutineItemState[];
  completedUnits: number;
  targetUnits: number;
  completedItemCount: number;
  totalItemCount: number;
  rate: number;
}

export interface RoutineWithItems extends Routine {
  items: RoutineItem[];
}

export interface RoutineSetWithMeta extends RoutineSet {
  routines: Routine[];
}

export interface ResolvedAssignment {
  date: string;
  baseSetId: string | null;
  baseSetName: string | null;
  source: "rule" | "override" | "none";
  includeRoutineIds: string[];
  excludeRoutineIds: string[];
  activeRoutineIds: string[];
}

export interface TodayRoutine extends Routine {
  items: RoutineItemState[];
  progress: RoutineProgress;
}

export interface CalendarDaySummary {
  date: string;
  routineProgressRate: number;
  completedUnits: number;
  targetUnits: number;
  todoCount: number;
  completedTodoCount: number;
  setId: string | null;
  setName: string | null;
  overrideApplied: boolean;
}

export interface RankedRoutineStat {
  routineId: string;
  name: string;
  color: string;
  completionRate: number;
  completedUnits: number;
  targetUnits: number;
}

export interface TodoCompletionStat {
  completed: number;
  total: number;
  rate: number;
}

export interface StatsSummary {
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  currentStreak: number;
  bestStreak: number;
  topRoutines: RankedRoutineStat[];
  todoCompletion: TodoCompletionStat;
}

export interface TodayResponse {
  ok: true;
  date: string;
  assignment: ResolvedAssignment;
  summary: {
    routineRate: number;
    completedUnits: number;
    targetUnits: number;
    completedItemCount: number;
    totalItemCount: number;
    dueTodayCount: number;
    inboxCount: number;
    completedTodoCount: number;
  };
  routines: TodayRoutine[];
  todos: {
    dueToday: Todo[];
    inbox: Todo[];
  };
}

export interface CheckinsResponse {
  ok: true;
  date: string;
  assignment: ResolvedAssignment;
  routines: TodayRoutine[];
}

export interface RoutinesResponse {
  ok: true;
  routines: RoutineWithItems[];
}

export interface RoutineSetsResponse {
  ok: true;
  routineSets: RoutineSetWithMeta[];
}

export interface AssignmentsResponse {
  ok: true;
  assignments: RoutineAssignmentRule[];
}

export interface OverrideResponse {
  ok: true;
  date: string;
  override: RoutineDateOverride;
  resolvedAssignment: ResolvedAssignment;
}

export interface TodosResponse {
  ok: true;
  todos: Todo[];
}

export interface CalendarResponse {
  ok: true;
  month: string;
  days: CalendarDaySummary[];
}

export interface StatsResponse {
  ok: true;
  range: "week" | "month" | "custom";
  startDate: string;
  endDate: string;
  summary: StatsSummary;
}

export interface HealthResponse {
  ok: true;
  project: string;
  productName: string;
}
