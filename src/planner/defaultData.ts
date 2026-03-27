import type { PlannerData } from "./types.js";

function timestamp(value: string) {
  return value;
}

export function createDefaultPlannerData(): PlannerData {
  return {
    routines: [],
    routineTaskTemplates: [],
    routineItems: [],
    routineCheckins: [],
    routineSets: [],
    routineAssignmentRules: [],
    routineDateOverrides: [],
    todos: [],
  };
}

export function createSamplePlannerData(): PlannerData {
  return {
    routines: [
      {
        id: "routine-weekday",
        name: "Weekday Launch",
        emoji: "🚀",
        color: "#f97316",
        isArchived: false,
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
      {
        id: "routine-weekend",
        name: "Weekend Reset",
        emoji: "🌿",
        color: "#0f766e",
        isArchived: false,
        createdAt: timestamp("2026-03-20T12:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T12:00:00.000Z"),
      },
      {
        id: "routine-focus",
        name: "Focus Sprint",
        emoji: "🎯",
        color: "#2563eb",
        isArchived: false,
        createdAt: timestamp("2026-03-21T08:00:00.000Z"),
        updatedAt: timestamp("2026-03-21T08:00:00.000Z"),
      },
    ],
    routineTaskTemplates: [
      {
        id: "task-plan",
        title: "Write top 3 priorities",
        trackingType: "binary",
        targetCount: 1,
        isArchived: false,
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
      {
        id: "task-water",
        title: "Drink water",
        trackingType: "count",
        targetCount: 3,
        isArchived: false,
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
      {
        id: "task-inbox",
        title: "Clear inbox zero",
        trackingType: "binary",
        targetCount: 1,
        isArchived: false,
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
      {
        id: "task-laundry",
        title: "Laundry",
        trackingType: "binary",
        targetCount: 1,
        isArchived: false,
        createdAt: timestamp("2026-03-20T12:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T12:00:00.000Z"),
      },
      {
        id: "task-walk",
        title: "Walk outside",
        trackingType: "count",
        targetCount: 2,
        isArchived: false,
        createdAt: timestamp("2026-03-20T12:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T12:00:00.000Z"),
      },
      {
        id: "task-focus",
        title: "Deep work block",
        trackingType: "time",
        targetCount: 90,
        isArchived: false,
        createdAt: timestamp("2026-03-21T08:00:00.000Z"),
        updatedAt: timestamp("2026-03-21T08:00:00.000Z"),
      },
    ],
    routineItems: [
      {
        id: "item-plan",
        routineId: "routine-weekday",
        templateId: "task-plan",
        sortOrder: 1,
        isActive: true,
      },
      {
        id: "item-water",
        routineId: "routine-weekday",
        templateId: "task-water",
        sortOrder: 2,
        isActive: true,
      },
      {
        id: "item-inbox",
        routineId: "routine-weekday",
        templateId: "task-inbox",
        sortOrder: 3,
        isActive: true,
      },
      {
        id: "item-laundry",
        routineId: "routine-weekend",
        templateId: "task-laundry",
        sortOrder: 1,
        isActive: true,
      },
      {
        id: "item-walk",
        routineId: "routine-weekend",
        templateId: "task-walk",
        sortOrder: 2,
        isActive: true,
      },
      {
        id: "item-focus",
        routineId: "routine-focus",
        templateId: "task-focus",
        sortOrder: 1,
        isActive: true,
      },
    ],
    routineCheckins: [
      {
        date: "2026-03-20",
        routineId: "routine-weekday",
        itemProgress: {
          "item-plan": 1,
          "item-water": 2,
          "item-inbox": 1,
        },
        updatedAt: timestamp("2026-03-20T23:59:00.000Z"),
      },
      {
        date: "2026-03-21",
        routineId: "routine-weekday",
        itemProgress: {
          "item-plan": 1,
          "item-water": 3,
          "item-inbox": 1,
        },
        updatedAt: timestamp("2026-03-21T23:59:00.000Z"),
      },
      {
        date: "2026-03-22",
        routineId: "routine-weekend",
        itemProgress: {
          "item-laundry": 1,
          "item-walk": 1,
        },
        updatedAt: timestamp("2026-03-22T10:00:00.000Z"),
      },
      {
        date: "2026-03-22",
        routineId: "routine-focus",
        itemProgress: {
          "item-focus": 45,
        },
        updatedAt: timestamp("2026-03-22T21:00:00.000Z"),
      },
    ],
    routineSets: [
      {
        id: "set-weekday",
        name: "Weekday",
        routineIds: ["routine-weekday"],
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
      {
        id: "set-weekend",
        name: "Weekend",
        routineIds: ["routine-weekend"],
        createdAt: timestamp("2026-03-20T12:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T12:00:00.000Z"),
      },
    ],
    routineAssignmentRules: [
      {
        id: "assign-weekday",
        ruleType: "weekday",
        days: [1, 2, 3, 4, 5],
        setId: "set-weekday",
        createdAt: timestamp("2026-03-20T07:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T07:00:00.000Z"),
      },
      {
        id: "assign-weekend",
        ruleType: "weekend",
        days: [0, 6],
        setId: "set-weekend",
        createdAt: timestamp("2026-03-20T12:00:00.000Z"),
        updatedAt: timestamp("2026-03-20T12:00:00.000Z"),
      },
    ],
    routineDateOverrides: [
      {
        date: "2026-03-22",
        setId: null,
        includeRoutineIds: ["routine-focus"],
        excludeRoutineIds: [],
        updatedAt: timestamp("2026-03-22T08:00:00.000Z"),
      },
    ],
    todos: [
      {
        id: "todo-groceries",
        title: "Buy groceries",
        emoji: "🛒",
        note: "Fruit and yogurt",
        dueDate: "2026-03-22",
        status: "pending",
        completedAt: null,
        createdAt: timestamp("2026-03-21T08:00:00.000Z"),
        updatedAt: timestamp("2026-03-21T08:00:00.000Z"),
      },
      {
        id: "todo-booking",
        title: "Book dentist visit",
        emoji: "🦷",
        note: null,
        dueDate: null,
        status: "pending",
        completedAt: null,
        createdAt: timestamp("2026-03-21T08:30:00.000Z"),
        updatedAt: timestamp("2026-03-21T08:30:00.000Z"),
      },
      {
        id: "todo-receipt",
        title: "Upload expense receipt",
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
