export type ActiveDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TrackingType = "binary" | "count" | "time";

export interface Habit {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  tag: string | null;
  trackingType: TrackingType;
  targetCount: number;
  startDate: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HabitCheckin {
  date: string;
  habitId: string;
  value: number;
  timeEntries: string[];
  updatedAt: string;
}

export interface Routine {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  habitIds: string[];
  notificationEnabled: boolean;
  notificationTime: string | null;
  notificationWeekdays: ActiveDay[];
  createdAt: string;
  updatedAt: string;
}

export interface RoutineMode {
  id: string;
  name: string;
  routineIds: string[];
  habitIds: string[];
  activeDays: ActiveDay[];
  createdAt: string;
  updatedAt: string;
}

export interface RoutineModeOverride {
  date: string;
  modeId: string | null;
  updatedAt: string;
}

export interface DailyNote {
  date: string;
  note: string;
  updatedAt: string;
}

export type TaskStatus = "pending" | "done";

export interface Task {
  id: string;
  title: string;
  emoji: string | null;
  note: string | null;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerData {
  habits: Habit[];
  habitCheckins: HabitCheckin[];
  routines: Routine[];
  routineModes: RoutineMode[];
  routineModeOverrides: RoutineModeOverride[];
  dailyNotes: DailyNote[];
  tasks: Task[];
}

export interface TodayHabit extends Habit {
  currentValue: number;
  isComplete: boolean;
  progressRate: number;
  streak: number;
  timeEntries: string[];
  latestTimeEntry: string | null;
}

export interface HabitWithStats extends Habit {
  currentStreak: number;
  bestStreak: number;
}

export interface RoutineWithHabits extends Routine {
  habits: Habit[];
}

export interface RoutineModeWithDetails extends RoutineMode {
  reservedDates: string[];
  routines: RoutineWithHabits[];
  habits: Habit[];
}

export interface CalendarDaySummary {
  date: string;
  habitProgressRate: number;
  completedHabits: number;
  totalHabits: number;
  taskCount: number;
  completedTaskCount: number;
}

export interface RankedHabitStat {
  habitId: string;
  name: string;
  emoji: string | null;
  color: string;
  completionRate: number;
  completedDays: number;
  trackedDays: number;
}

export interface TaskCompletionStat {
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
  topHabits: RankedHabitStat[];
  taskCompletion: TaskCompletionStat;
}

export interface TodayResponse {
  ok: true;
  date: string;
  activeMode: { id: string; name: string } | null;
  summary: {
    habitRate: number;
    completedHabits: number;
    totalHabits: number;
    remainingHabits: number;
  };
  habits: TodayHabit[];
  dailyNote: {
    note: string | null;
    updatedAt: string | null;
  };
}

export interface HabitCheckinsResponse {
  ok: true;
  date: string;
  habits: TodayHabit[];
}

export interface HabitsResponse {
  ok: true;
  habits: HabitWithStats[];
}

export interface RoutinesResponse {
  ok: true;
  routines: RoutineWithHabits[];
}

export interface RoutineModesResponse {
  ok: true;
  modes: RoutineModeWithDetails[];
}

export interface TasksResponse {
  ok: true;
  tasks: Task[];
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
  storageDriver?: "json" | "mysql";
  authAvailable?: boolean;
  authRequired?: boolean;
}
