import type { PlannerData } from "./types.js";

function timestamp(value: string) {
  return value;
}

export function createDefaultPlannerData(): PlannerData {
  return {
    habits: [],
    habitCheckins: [],
    routines: [],
    routineModes: [],
    routineModeOverrides: [],
    tasks: [],
  };
}

export function createSamplePlannerData(): PlannerData {
  return {
    habits: [
      {
        id: "habit-water",
        name: "물 마시기",
        emoji: "💧",
        color: "#16a34a",
        tag: "건강",
        trackingType: "count",
        targetCount: 3,
        startDate: "2026-03-20",
        sortOrder: 1,
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
      {
        id: "habit-plan",
        name: "오늘 우선순위 쓰기",
        emoji: "📝",
        color: "#f97316",
        tag: "업무",
        trackingType: "binary",
        targetCount: 1,
        startDate: "2026-03-20",
        sortOrder: 2,
        createdAt: timestamp("2026-03-20T07:10:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:10:00.000Z"),
      },
      {
        id: "habit-focus",
        name: "집중 블록",
        emoji: "⏳",
        color: "#2563eb",
        tag: "집중",
        trackingType: "time",
        targetCount: 1,
        startDate: "2026-03-21",
        sortOrder: 3,
        createdAt: timestamp("2026-03-21T08:00:00.000Z"),
        updatedAt: timestamp("2026-03-21T08:00:00.000Z"),
      },
    ],
    habitCheckins: [
      {
        date: "2026-03-20",
        habitId: "habit-water",
        value: 2,
        timeEntries: [],
        updatedAt: timestamp("2026-03-20T23:00:00.000Z"),
      },
      {
        date: "2026-03-20",
        habitId: "habit-plan",
        value: 1,
        timeEntries: [],
        updatedAt: timestamp("2026-03-20T23:05:00.000Z"),
      },
      {
        date: "2026-03-21",
        habitId: "habit-water",
        value: 3,
        timeEntries: [],
        updatedAt: timestamp("2026-03-21T23:00:00.000Z"),
      },
      {
        date: "2026-03-21",
        habitId: "habit-plan",
        value: 1,
        timeEntries: [],
        updatedAt: timestamp("2026-03-21T23:05:00.000Z"),
      },
      {
        date: "2026-03-22",
        habitId: "habit-water",
        value: 1,
        timeEntries: [],
        updatedAt: timestamp("2026-03-22T09:10:00.000Z"),
      },
      {
        date: "2026-03-22",
        habitId: "habit-focus",
        value: 1,
        timeEntries: [timestamp("2026-03-22T20:10:00.000Z")],
        updatedAt: timestamp("2026-03-22T20:10:00.000Z"),
      },
    ],
    routines: [
      {
        id: "routine-morning",
        name: "아침 루틴",
        emoji: "🌤️",
        color: "#f97316",
        habitIds: ["habit-water", "habit-plan"],
        notificationEnabled: true,
        notificationTime: "07:30",
        notificationWeekdays: [1, 2, 3, 4, 5],
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
      {
        id: "routine-focus",
        name: "집중 루틴",
        emoji: "🧠",
        color: "#2563eb",
        habitIds: ["habit-focus"],
        notificationEnabled: false,
        notificationTime: null,
        notificationWeekdays: [],
        createdAt: timestamp("2026-03-21T08:00:00.000Z"),
        updatedAt: timestamp("2026-03-21T08:00:00.000Z"),
      },
    ],
    routineModes: [
      {
        id: "mode-default",
        name: "기본 모드",
        routineIds: ["routine-morning", "routine-focus"],
        habitIds: [],
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
    ],
    routineModeOverrides: [],
    tasks: [
      {
        id: "task-groceries",
        title: "장보기",
        emoji: "🛒",
        note: "과일과 요거트",
        dueDate: "2026-03-22",
        status: "pending",
        completedAt: null,
        createdAt: timestamp("2026-03-21T08:00:00.000Z"),
        updatedAt: timestamp("2026-03-21T08:00:00.000Z"),
      },
      {
        id: "task-booking",
        title: "치과 예약",
        emoji: "🦷",
        note: null,
        dueDate: null,
        status: "pending",
        completedAt: null,
        createdAt: timestamp("2026-03-21T08:30:00.000Z"),
        updatedAt: timestamp("2026-03-21T08:30:00.000Z"),
      },
      {
        id: "task-receipt",
        title: "영수증 업로드",
        emoji: "🧾",
        note: null,
        dueDate: "2026-03-21",
        status: "done",
        completedAt: timestamp("2026-03-21T12:00:00.000Z"),
        createdAt: timestamp("2026-03-21T09:00:00.000Z"),
        updatedAt: timestamp("2026-03-21T12:00:00.000Z"),
      },
    ],
  };
}
