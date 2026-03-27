import express, { type Request } from "express";
import { AdminService } from "./admin/service.js";
import { AuditLogService, type AuditLogInput } from "./audit/service.js";
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

function setNoCacheHeaders(res: express.Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function setStaticAssetHeaders(res: express.Response, filePath: string) {
  if (/\.(html|js|css)$/i.test(filePath)) {
    setNoCacheHeaders(res);
  }
}

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
  app.use(
    express.static(publicDir, {
      setHeaders: (res, filePath) => {
        setStaticAssetHeaders(res, filePath);
      },
    }),
  );

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

  async function recordServerActivity(entry: AuditLogInput) {
    console.info("[activity]", {
      scope: entry.scope,
      eventType: entry.eventType,
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? null,
      targetUserId: entry.targetUserId ?? null,
      message: entry.message,
      details: entry.details ?? null,
    });
    if (!auditLogService) {
      return;
    }
    try {
      await auditLogService.record(entry);
    } catch (error) {
      console.error("Failed to record activity log", error);
    }
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
      const date = typeof req.query?.date === "string" ? req.query.date : undefined;
      res.json(await plannerFor(actor.userId).getToday(date));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/habits", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).listHabits());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/habits", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const habit = await plannerFor(actor.userId).createHabit(req.body);
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.habits",
        eventType: "create-habit",
        message: "User created a habit",
        details: { habitId: habit.id, trackingType: habit.trackingType },
      });
      res.status(201).json({ ok: true, habit });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/habits/:id", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const habit = await plannerFor(actor.userId).updateHabit(req.params.id, req.body);
      if (!habit) {
        res.status(404).json({ ok: false, message: "Habit not found" });
        return;
      }
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.habits",
        eventType: "update-habit",
        message: "User updated a habit",
        details: { habitId: habit.id, trackingType: habit.trackingType },
      });
      res.json({ ok: true, habit });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/habits/:id", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const deleted = await plannerFor(actor.userId).deleteHabit(req.params.id);
      if (!deleted) {
        res.status(404).json({ ok: false, message: "Habit not found" });
        return;
      }
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.habits",
        eventType: "delete-habit",
        message: "User deleted a habit",
        details: { habitId: req.params.id },
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/habits/reorder", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const result = await plannerFor(actor.userId).reorderHabits({
        habitIds: Array.isArray(req.body?.habitIds) ? (req.body.habitIds as string[]) : [],
      });
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.habits",
        eventType: "reorder-habits",
        message: "User reordered habits",
        details: { habitCount: result.habits.length },
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/habit-checkins/:date", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).getHabitCheckins(req.params.date));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/habit-checkins/:date/habits/:habitId", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const habit = await plannerFor(actor.userId).upsertHabitCheckin(req.params.date, req.params.habitId, {
        value: typeof req.body?.value === "number" ? req.body.value : undefined,
        completed: typeof req.body?.completed === "boolean" ? req.body.completed : undefined,
      });
      if (!habit) {
        res.status(404).json({ ok: false, message: "Habit not found" });
        return;
      }
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.habit-checkins",
        eventType: "upsert-habit-checkin",
        message: "User updated habit progress",
        details: {
          date: req.params.date,
          habitId: habit.id,
          value: habit.currentValue,
          targetCount: habit.targetCount,
        },
      });
      res.json({ ok: true, habit });
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
      if (!routine) {
        throw new Error("Failed to create routine");
      }
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.routines",
        eventType: "create-routine",
        message: "User created a routine",
        details: { routineId: routine.id, habitCount: routine.habits.length },
      });
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
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.routines",
        eventType: "update-routine",
        message: "User updated a routine",
        details: {
          routineId: routine.id,
          habitCount: routine.habits.length,
          notificationEnabled: routine.notificationEnabled,
        },
      });
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
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.routines",
        eventType: "delete-routine",
        message: "User deleted a routine",
        details: { routineId: req.params.id },
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      res.json(await plannerFor(actor.userId).listTasks());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const task = await plannerFor(actor.userId).createTask(req.body);
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.tasks",
        eventType: "create-task",
        message: "User created a task",
        details: { taskId: task.id, dueDate: task.dueDate, status: task.status },
      });
      res.status(201).json({ ok: true, task });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/tasks/:id", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const task = await plannerFor(actor.userId).updateTask(req.params.id, req.body);
      if (!task) {
        res.status(404).json({ ok: false, message: "Task not found" });
        return;
      }
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.tasks",
        eventType: "update-task",
        message: "User updated a task",
        details: { taskId: task.id, dueDate: task.dueDate, status: task.status },
      });
      res.json({ ok: true, task });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tasks/:id", async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const deleted = await plannerFor(actor.userId).deleteTask(req.params.id);
      if (!deleted) {
        res.status(404).json({ ok: false, message: "Task not found" });
        return;
      }
      await recordServerActivity({
        actorUserId: actor.userId,
        actorRole: actor.user?.role,
        targetUserId: actor.userId,
        scope: "planner.tasks",
        eventType: "delete-task",
        message: "User deleted a task",
        details: { taskId: req.params.id },
      });
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
    setNoCacheHeaders(res);
    res.sendFile(path.resolve(publicDir, "index.html"));
  });

  app.get("/login", (_req, res) => {
    setNoCacheHeaders(res);
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
