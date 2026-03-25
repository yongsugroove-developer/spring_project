import express, { type Request } from "express";
import { AdminService } from "./admin/service.js";
import { AuditLogService } from "./audit/service.js";
import path from "node:path";
import { AuthService, type AuthUser } from "./auth/service.js";
import { BillingService } from "./billing/service.js";
import { loadConfig, type StorageDriver } from "./config.js";
import { DEFAULT_BILLING_PLANS, createMySqlPool, ensureDatabase, ensureMySqlSchema } from "./db/mysql.js";
import { JsonPlannerRepository } from "./planner/repository.js";
import { MySqlPlannerRepository } from "./planner/mysqlRepository.js";
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
  | "internalServerError"
  | "authenticationRequired"
  | "authUnavailable";

const SERVER_MESSAGES: Record<ServerLocale, Record<ServerMessageKey, string>> = {
  ko: {
    routineNotFound: "루틴을 찾을 수 없습니다.",
    routineItemNotFound: "루틴 항목을 찾을 수 없습니다.",
    routineSetNotFound: "루틴 세트를 찾을 수 없습니다.",
    todoNotFound: "투두를 찾을 수 없습니다.",
    monthRequired: "month 쿼리가 필요합니다.",
    apiRouteNotFound: "API 경로를 찾을 수 없습니다.",
    internalServerError: "서버 내부 오류가 발생했습니다.",
    authenticationRequired: "로그인이 필요합니다.",
    authUnavailable: "인증 기능을 아직 사용할 수 없습니다.",
  },
  en: {
    routineNotFound: "Routine not found",
    routineItemNotFound: "Routine item not found",
    routineSetNotFound: "Routine set not found",
    todoNotFound: "Todo not found",
    monthRequired: "month query is required",
    apiRouteNotFound: "API route not found",
    internalServerError: "Internal server error",
    authenticationRequired: "Authentication required",
    authUnavailable: "Authentication is not available",
  },
  ja: {
    routineNotFound: "ルーティンが見つかりません。",
    routineItemNotFound: "ルーティン項目が見つかりません。",
    routineSetNotFound: "ルーティンセットが見つかりません。",
    todoNotFound: "Todoが見つかりません。",
    monthRequired: "month クエリが必要です。",
    apiRouteNotFound: "API ルートが見つかりません。",
    internalServerError: "サーバー内部エラーが発生しました。",
    authenticationRequired: "ログインが必要です。",
    authUnavailable: "認証機能はまだ利用できません。",
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

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface AppOptions {
  dataFile?: string;
  now?: () => Date;
  storageDriver?: StorageDriver;
  authRequired?: boolean;
}

interface RequestActor {
  userId: string;
  user: AuthUser | null;
  token: string | null;
  usedDefault: boolean;
}

function isAdminRole(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export function createApp(options: AppOptions = {}) {
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const inferredStorageDriver = options.storageDriver ?? (options.dataFile || isTestEnv ? "json" : undefined);
  const config = loadConfig(options.dataFile ?? defaultDataFile);
  config.storageDriver = inferredStorageDriver ?? config.storageDriver;
  if (options.dataFile) {
    config.dataFile = options.dataFile;
  }
  if (typeof options.authRequired === "boolean") {
    config.auth.required = options.authRequired;
  }

  const app = express();
  const jsonPlanner = new PlannerService(new JsonPlannerRepository(config.dataFile), { now: options.now });

  let authService: AuthService | null = null;
  let billingService: BillingService | null = null;
  let adminService: AdminService | null = null;
  let auditLogService: AuditLogService | null = null;
  const createPlannerForUser = (userId: string) =>
    new PlannerService(new MySqlPlannerRepository(mysqlPool!, userId), { now: options.now });
  let defaultUserId: string | null = null;
  let mysqlPool: ReturnType<typeof createMySqlPool> | null = null;

  const ready =
    config.storageDriver === "mysql"
      ? (async () => {
          await ensureDatabase(config);
          mysqlPool = createMySqlPool(config);
          await ensureMySqlSchema(mysqlPool);
          authService = new AuthService(mysqlPool, config.auth.sessionTtlHours);
          billingService = new BillingService(mysqlPool);
          adminService = new AdminService(mysqlPool);
          auditLogService = new AuditLogService(mysqlPool);
          await billingService.seedPlans(
            DEFAULT_BILLING_PLANS.map((plan) => ({ ...plan, currency: config.billing.currency })),
          );
          const bootstrapUser = await authService.ensureBootstrapUser({
            email: config.auth.bootstrapEmail,
            password: config.auth.bootstrapPassword,
            displayName: config.auth.bootstrapDisplayName,
          });
          await billingService.ensureCustomer(bootstrapUser.id);
          defaultUserId = bootstrapUser.id;
        })()
      : Promise.resolve();

  app.use(express.json());
  app.use(express.static(publicDir));

  async function ensureReady() {
    await ready;
  }

  async function resolveActor(req: Request, requireUser = false): Promise<RequestActor> {
    await ensureReady();

    if (config.storageDriver === "json") {
      return {
        userId: "local-json",
        user: null,
        token: null,
        usedDefault: true,
      };
    }

    if (!authService) {
      throw new HttpError(503, messageFor(req, "authUnavailable"));
    }

    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token) {
      const user = await authService.resolveSession(token);
      if (user) {
        return { userId: user.id, user, token, usedDefault: false };
      }
    }

    if (!config.auth.required && defaultUserId) {
      const user = await authService.getUserById(defaultUserId);
      return {
        userId: defaultUserId,
        user,
        token: null,
        usedDefault: true,
      };
    }

    if (requireUser || config.auth.required) {
      throw new HttpError(401, messageFor(req, "authenticationRequired"));
    }

    throw new HttpError(401, messageFor(req, "authenticationRequired"));
  }

  function plannerFor(userId: string) {
    if (config.storageDriver === "json") {
      return jsonPlanner;
    }
    return createPlannerForUser(userId);
  }

  async function requireServices(req: Request) {
    await ensureReady();
    if (!authService || !billingService || !adminService || !auditLogService) {
      throw new HttpError(503, messageFor(req, "authUnavailable"));
    }
    return { authService, billingService, adminService, auditLogService };
  }

  async function requireAdminActor(req: Request) {
    await ensureReady();
    if (config.storageDriver === "json") {
      throw new HttpError(503, messageFor(req, "authUnavailable"));
    }
    const actor = await resolveActor(req, true);
    if (actor.usedDefault || !actor.token) {
      throw new HttpError(401, messageFor(req, "authenticationRequired"));
    }
    if (!isAdminRole(actor.user?.role)) {
      throw new HttpError(403, "Admin access is required");
    }
    return actor;
  }

  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  app.get("/api/health", async (_req, res, next) => {
    try {
      await ensureReady();
      const payload: HealthResponse & { storageDriver: StorageDriver } = {
        ok: true,
        project: "my-planner",
        productName: "마이 플래너",
        storageDriver: config.storageDriver,
        authAvailable: config.storageDriver === "mysql",
        authRequired: config.auth.required,
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { authService, billingService, auditLogService } = await requireServices(req);
      const result = await authService.register(req.body ?? {});
      await billingService.ensureCustomer(result.user.id);
      await auditLogService.record({
        actorUserId: result.user.id,
        actorRole: result.user.role,
        targetUserId: result.user.id,
        scope: "auth",
        eventType: "register",
        message: "User account registered",
        details: { email: result.user.email },
      });
      res.status(201).json({
        ok: true,
        user: result.user,
        session: result.session,
        billing: await billingService.getOverview(result.user.id),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { authService, billingService, auditLogService } = await requireServices(req);
      const result = await authService.login(req.body ?? {});
      await billingService.ensureCustomer(result.user.id);
      await auditLogService.record({
        actorUserId: result.user.id,
        actorRole: result.user.role,
        targetUserId: result.user.id,
        scope: "auth",
        eventType: "login",
        message: "User logged in",
      });
      res.json({
        ok: true,
        user: result.user,
        session: result.session,
        billing: await billingService.getOverview(result.user.id),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", async (req, res, next) => {
    try {
      const actor = await resolveActor(req, true);
      const { authService, auditLogService } = await requireServices(req);
      const token = actor.token ?? "";
      if (token) {
        await authService.logout(token);
      }
      await auditLogService.record({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "auth",
        eventType: "logout",
        message: "User logged out",
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/me", async (req, res, next) => {
    try {
      const actor = await resolveActor(req, true);
      const { billingService } = await requireServices(req);
      res.json({
        ok: true,
        user: actor.user,
        usedDefault: actor.usedDefault,
        billing: await billingService.getOverview(actor.userId),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/billing/plans", async (req, res, next) => {
    try {
      const { billingService } = await requireServices(req);
      res.json({ ok: true, plans: await billingService.listPlans() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/billing/overview", async (req, res, next) => {
    try {
      const actor = await resolveActor(req, true);
      const { billingService } = await requireServices(req);
      res.json(await billingService.getOverview(actor.userId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/billing/subscription", async (req, res, next) => {
    try {
      const actor = await resolveActor(req, true);
      const { billingService, auditLogService } = await requireServices(req);
      const planCode = String(req.body?.planCode || "");
      const result = await billingService.activateManualSubscription(actor.userId, planCode);
      await auditLogService.record({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "billing",
        eventType: "activate-manual-subscription",
        message: "User activated a billing plan",
        details: { planCode },
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/overview", async (req, res, next) => {
    try {
      await requireAdminActor(req);
      const { adminService } = await requireServices(req);
      res.json(await adminService.getOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/users", async (req, res, next) => {
    try {
      await requireAdminActor(req);
      const { adminService } = await requireServices(req);
      res.json(await adminService.listUsers());
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/users/:id", async (req, res, next) => {
    try {
      const actor = await requireAdminActor(req);
      const { adminService, auditLogService } = await requireServices(req);
      const updated = await adminService.updateUserAccess(
        req.params.id,
        {
          role: typeof req.body?.role === "string" ? req.body.role : undefined,
          status: typeof req.body?.status === "string" ? req.body.status : undefined,
        },
        {
          userId: actor.userId,
          role: actor.user?.role ?? "member",
        },
      );
      if (!updated) {
        res.status(404).json({ ok: false, message: "User not found" });
        return;
      }
      await auditLogService.record({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: updated.id,
        scope: "admin.accounts",
        eventType: "update-user-access",
        message: "Admin updated a user account",
        details: { role: updated.role, status: updated.status },
      });
      res.json({ ok: true, user: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/users/:id/subscription", async (req, res, next) => {
    try {
      const actor = await requireAdminActor(req);
      const { billingService, auditLogService } = await requireServices(req);
      const planCode = String(req.body?.planCode || "");
      const result = await billingService.activateManualSubscription(req.params.id, planCode);
      await auditLogService.record({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: req.params.id,
        scope: "admin.billing",
        eventType: "assign-user-plan",
        message: "Admin assigned a billing plan",
        details: { planCode },
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/subscriptions", async (req, res, next) => {
    try {
      await requireAdminActor(req);
      const { adminService } = await requireServices(req);
      res.json(await adminService.listSubscriptions());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/sessions", async (req, res, next) => {
    try {
      await requireAdminActor(req);
      const { adminService } = await requireServices(req);
      res.json(await adminService.listSessions());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/logs", async (req, res, next) => {
    try {
      await requireAdminActor(req);
      const { auditLogService } = await requireServices(req);
      res.json({ ok: true, logs: await auditLogService.listRecent() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/today", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).getToday());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/routines", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).listRoutines());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/routines", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const routine = await plannerFor(actor.userId).createRoutine(req.body);
      res.status(201).json({ ok: true, routine });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/routines/:id", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const routine = await plannerFor(actor.userId).updateRoutine(req.params.id, req.body);
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
      const actor = await resolveActor(req);
      const deleted = await plannerFor(actor.userId).deleteRoutine(req.params.id);
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
      const actor = await resolveActor(req);
      const item = await plannerFor(actor.userId).addRoutineItem(req.params.id, req.body);
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
      const actor = await resolveActor(req);
      const item = await plannerFor(actor.userId).updateRoutineItem(req.params.id, req.params.itemId, req.body);
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
      const actor = await resolveActor(req);
      const deleted = await plannerFor(actor.userId).deleteRoutineItem(req.params.id, req.params.itemId);
      if (!deleted) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineItemNotFound") });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/routine-sets", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).listRoutineSets());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/routine-sets", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const routineSet = await plannerFor(actor.userId).createRoutineSet(req.body);
      res.status(201).json({ ok: true, routineSet });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/routine-sets/:id", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const routineSet = await plannerFor(actor.userId).updateRoutineSet(req.params.id, req.body);
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
      const actor = await resolveActor(req);
      const deleted = await plannerFor(actor.userId).deleteRoutineSet(req.params.id);
      if (!deleted) {
        res.status(404).json({ ok: false, message: messageFor(req, "routineSetNotFound") });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/assignments", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).getAssignments());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/assignments", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
      res.json(await plannerFor(actor.userId).replaceAssignments(assignments));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/overrides/:date", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).getOverride(req.params.date));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/overrides/:date", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).upsertOverride(req.params.date, req.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/checkins/:date", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).getCheckins(req.params.date));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/checkins/:date/routines/:routineId", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const routine = await plannerFor(actor.userId).upsertCheckin(req.params.date, req.params.routineId, {
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

  app.get("/api/todos", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).listTodos());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/todos", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const todo = await plannerFor(actor.userId).createTodo(req.body);
      res.status(201).json({ ok: true, todo });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/todos/:id", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const todo = await plannerFor(actor.userId).updateTodo(req.params.id, req.body);
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
      const actor = await resolveActor(req);
      const deleted = await plannerFor(actor.userId).deleteTodo(req.params.id);
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
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).getCalendar(month));
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
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).getStats(range, start, end));
    } catch (error) {
      next(error);
    }
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.resolve(publicDir, "index.html"));
  });

  app.get("/login", (_req, res) => {
    res.sendFile(path.resolve(publicDir, "login.html"));
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
      if (error instanceof HttpError) {
        res.status(error.status).json({ ok: false, message: error.message });
        return;
      }
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
