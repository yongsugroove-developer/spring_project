import express, { type Request } from "express";
import path from "node:path";
import { JsonPlannerRepository } from "./planner/repository.js";
import { PlannerService, PlannerValidationError } from "./planner/service.js";
import type { HealthResponse } from "./planner/types.js";

const projectRoot = process.cwd();
const publicDir = path.resolve(projectRoot, "public");
const defaultDataFile = path.resolve(projectRoot, "data", "planner-data.json");

type ServerLocale = "ko" | "en" | "ja";
type ServerMessageKey =
  | "routineNotFound"
  | "routineItemNotFound"
  | "routineSetNotFound"
  | "todoNotFound"
  | "monthRequired"
  | "apiRouteNotFound"
  | "internalServerError";

const SERVER_MESSAGES: Record<ServerLocale, Record<ServerMessageKey, string>> = {
  ko: {
    routineNotFound: "\ub8e8\ud2f4\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
    routineItemNotFound: "\ub8e8\ud2f4 \ud56d\ubaa9\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
    routineSetNotFound: "\ub8e8\ud2f4 \uc138\ud2b8\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
    todoNotFound: "\ud22c\ub450\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
    monthRequired: "month \ucffc\ub9ac\uac00 \ud544\uc694\ud569\ub2c8\ub2e4.",
    apiRouteNotFound: "API \uacbd\ub85c\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
    internalServerError: "\uc11c\ubc84 \ub0b4\ubd80 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.",
  },
  en: {
    routineNotFound: "Routine not found",
    routineItemNotFound: "Routine item not found",
    routineSetNotFound: "Routine set not found",
    todoNotFound: "Todo not found",
    monthRequired: "month query is required",
    apiRouteNotFound: "API route not found",
    internalServerError: "Internal server error",
  },
  ja: {
    routineNotFound: "\u30eb\u30fc\u30c6\u30a3\u30f3\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
    routineItemNotFound: "\u30eb\u30fc\u30c6\u30a3\u30f3\u9805\u76ee\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
    routineSetNotFound: "\u30eb\u30fc\u30c6\u30a3\u30f3\u30bb\u30c3\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
    todoNotFound: "Todo\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
    monthRequired: "month \u30af\u30a8\u30ea\u304c\u5fc5\u8981\u3067\u3059\u3002",
    apiRouteNotFound: "API \u30eb\u30fc\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
    internalServerError: "\u30b5\u30fc\u30d0\u30fc\u5185\u90e8\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002",
  },
};

function resolveLocale(req: Request): ServerLocale {
  const header = req.get("accept-language")?.toLowerCase() ?? "";
  if (header.includes("ja")) return "ja";
  if (header.includes("en")) return "en";
  return "ko";
}

function messageFor(req: Request, key: ServerMessageKey) {
  return SERVER_MESSAGES[resolveLocale(req)][key];
}

interface AppOptions {
  dataFile?: string;
  now?: () => Date;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const repository = new JsonPlannerRepository(options.dataFile ?? defaultDataFile);
  const planner = new PlannerService(repository, { now: options.now });

  app.use(express.json());
  app.use(express.static(publicDir));

  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  app.get("/api/health", (_req, res) => {
    const payload: HealthResponse = {
      ok: true,
      project: "my-planner",
      productName: "\ub9c8\uc774 \ud50c\ub798\ub108",
    };
    res.json(payload);
  });

  app.get("/api/today", async (_req, res, next) => {
    try {
      res.json(await planner.getToday());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/routines", async (_req, res, next) => {
    try {
      res.json(await planner.listRoutines());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/routines", async (req, res, next) => {
    try {
      const routine = await planner.createRoutine(req.body);
      res.status(201).json({ ok: true, routine });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/routines/:id", async (req, res, next) => {
    try {
      const routine = await planner.updateRoutine(req.params.id, req.body);
      if (!routine) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineNotFound") });
        return;
      }
      res.json({ ok: true, routine });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/routines/:id", async (req, res, next) => {
    try {
      const deleted = await planner.deleteRoutine(req.params.id);
      if (!deleted) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineNotFound") });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/routines/:id/items", async (req, res, next) => {
    try {
      const item = await planner.addRoutineItem(req.params.id, req.body);
      if (!item) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineNotFound") });
        return;
      }
      res.status(201).json({ ok: true, item });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/routines/:id/items/:itemId", async (req, res, next) => {
    try {
      const item = await planner.updateRoutineItem(req.params.id, req.params.itemId, req.body);
      if (!item) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineItemNotFound") });
        return;
      }
      res.json({ ok: true, item });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/routines/:id/items/:itemId", async (req, res, next) => {
    try {
      const deleted = await planner.deleteRoutineItem(req.params.id, req.params.itemId);
      if (!deleted) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineItemNotFound") });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/routine-sets", async (_req, res, next) => {
    try {
      res.json(await planner.listRoutineSets());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/routine-sets", async (req, res, next) => {
    try {
      const routineSet = await planner.createRoutineSet(req.body);
      res.status(201).json({ ok: true, routineSet });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/routine-sets/:id", async (req, res, next) => {
    try {
      const routineSet = await planner.updateRoutineSet(req.params.id, req.body);
      if (!routineSet) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineSetNotFound") });
        return;
      }
      res.json({ ok: true, routineSet });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/routine-sets/:id", async (req, res, next) => {
    try {
      const deleted = await planner.deleteRoutineSet(req.params.id);
      if (!deleted) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineSetNotFound") });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/assignments", async (_req, res, next) => {
    try {
      res.json(await planner.getAssignments());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/assignments", async (req, res, next) => {
    try {
      const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
      res.json(await planner.replaceAssignments(assignments));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/overrides/:date", async (req, res, next) => {
    try {
      res.json(await planner.getOverride(req.params.date));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/overrides/:date", async (req, res, next) => {
    try {
      res.json(await planner.upsertOverride(req.params.date, req.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/checkins/:date", async (req, res, next) => {
    try {
      res.json(await planner.getCheckins(req.params.date));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/checkins/:date/routines/:routineId", async (req, res, next) => {
    try {
      const routine = await planner.upsertCheckin(req.params.date, req.params.routineId, {
        itemProgress:
          req.body?.itemProgress && typeof req.body.itemProgress === "object"
            ? (req.body.itemProgress as Record<string, number>)
            : undefined,
        completedItemIds: Array.isArray(req.body?.completedItemIds)
          ? (req.body.completedItemIds as string[])
          : undefined,
      });
      if (!routine) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineNotFound") });
        return;
      }
      res.json({ ok: true, routine });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/todos", async (_req, res, next) => {
    try {
      res.json(await planner.listTodos());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/todos", async (req, res, next) => {
    try {
      const todo = await planner.createTodo(req.body);
      res.status(201).json({ ok: true, todo });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/todos/:id", async (req, res, next) => {
    try {
      const todo = await planner.updateTodo(req.params.id, req.body);
      if (!todo) {
        res.status(404).json({ ok: false, message: messageFor(req, "todoNotFound") });
        return;
      }
      res.json({ ok: true, todo });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/todos/:id", async (req, res, next) => {
    try {
      const deleted = await planner.deleteTodo(req.params.id);
      if (!deleted) {
        res.status(404).json({ ok: false, message: messageFor(req, "todoNotFound") });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/calendar", async (req, res, next) => {
    try {
      const month = typeof req.query.month === "string" ? req.query.month : undefined;
      if (!month) {
        res.status(400).json({ ok: false, message: messageFor(req, "monthRequired") });
        return;
      }
      res.json(await planner.getCalendar(month));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stats", async (req, res, next) => {
    try {
      const range =
        req.query.range === "custom" || req.query.range === "week" || req.query.range === "month"
          ? req.query.range
          : "week";
      const start = typeof req.query.start === "string" ? req.query.start : undefined;
      const end = typeof req.query.end === "string" ? req.query.end : undefined;
      res.json(await planner.getStats(range, start, end));
    } catch (error) {
      next(error);
    }
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.resolve(publicDir, "index.html"));
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ ok: false, message: messageFor(req, "apiRouteNotFound") });
  });

  app.use(
    (
      error: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      void next;
      if (error instanceof PlannerValidationError) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }

      console.error(error);
      res.status(500).json({ ok: false, message: messageFor(req, "internalServerError") });
    },
  );

  return app;
}

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  const app = createApp();
  app.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`);
  });
}
