import type { Pool, RowDataPacket } from "mysql2/promise";
import { fromMySqlDateTime, toMySqlDateTime } from "../db/time.js";
import { PlannerValidationError } from "../planner/validation.js";

interface CountRow extends RowDataPacket {
  value: number;
}

interface AdminUserRow extends RowDataPacket {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastSessionAt: string | null;
  activeSessionCount: number;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  planCode: string | null;
  planName: string | null;
}

interface SubscriptionRow extends RowDataPacket {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: number;
  createdAt: string;
  code: string;
  name: string;
  billingInterval: "month" | "year";
  priceMinor: number;
  currency: string;
}

interface SessionRow extends RowDataPacket {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
  createdAt: string;
}

interface UserRow extends RowDataPacket {
  id: string;
  role: string;
  status: string;
}

export interface UpdateUserAccessInput {
  role?: string;
  status?: string;
}

export class AdminService {
  constructor(private readonly pool: Pool) {}

  async getOverview() {
    const now = new Date();
    const [totalUsers, activeUsers, adminUsers, activeSubscriptions, activeSessions, recentLogs, monthlyRevenue] =
      await Promise.all([
        countQuery(this.pool, `SELECT COUNT(*) AS value FROM users`),
        countQuery(this.pool, `SELECT COUNT(*) AS value FROM users WHERE status = 'active'`),
        countQuery(this.pool, `SELECT COUNT(*) AS value FROM users WHERE role IN ('owner', 'admin')`),
        countQuery(this.pool, `SELECT COUNT(*) AS value FROM billing_subscriptions WHERE status = 'active'`),
        countQuery(
          this.pool,
          `SELECT COUNT(*) AS value
           FROM auth_sessions
           WHERE revoked_at IS NULL AND expires_at > ?`,
          [toMySqlDateTime(now)],
        ),
        countQuery(
          this.pool,
          `SELECT COUNT(*) AS value
           FROM audit_logs
           WHERE created_at >= DATE_SUB(?, INTERVAL 1 DAY)`,
          [toMySqlDateTime(now)],
        ),
        countQuery(
          this.pool,
          `SELECT COALESCE(SUM(p.price_minor), 0) AS value
           FROM billing_subscriptions s
           JOIN billing_plans p ON p.id = s.plan_id
           WHERE s.status = 'active'`,
        ),
      ]);

    return {
      ok: true as const,
      summary: {
        totalUsers,
        activeUsers,
        adminUsers,
        activeSubscriptions,
        activeSessions,
        logsLast24Hours: recentLogs,
        monthlyRecurringRevenueMinor: monthlyRevenue,
      },
    };
  }

  async listUsers() {
    const [rows] = await this.pool.query<AdminUserRow[]>(
      `SELECT u.id, u.email, u.display_name AS displayName, u.role, u.status,
              u.created_at AS createdAt, u.updated_at AS updatedAt,
              (
                SELECT s.last_used_at
                FROM auth_sessions s
                WHERE s.user_id = u.id AND s.revoked_at IS NULL
                ORDER BY s.last_used_at DESC
                LIMIT 1
              ) AS lastSessionAt,
              (
                SELECT COUNT(*)
                FROM auth_sessions s
                WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP(3)
              ) AS activeSessionCount,
              (
                SELECT bs.status
                FROM billing_subscriptions bs
                WHERE bs.user_id = u.id
                ORDER BY bs.created_at DESC
                LIMIT 1
              ) AS subscriptionStatus,
              (
                SELECT bs.current_period_end
                FROM billing_subscriptions bs
                WHERE bs.user_id = u.id
                ORDER BY bs.created_at DESC
                LIMIT 1
              ) AS currentPeriodEnd,
              (
                SELECT bp.code
                FROM billing_subscriptions bs
                JOIN billing_plans bp ON bp.id = bs.plan_id
                WHERE bs.user_id = u.id
                ORDER BY bs.created_at DESC
                LIMIT 1
              ) AS planCode,
              (
                SELECT bp.name
                FROM billing_subscriptions bs
                JOIN billing_plans bp ON bp.id = bs.plan_id
                WHERE bs.user_id = u.id
                ORDER BY bs.created_at DESC
                LIMIT 1
              ) AS planName
       FROM users u
       ORDER BY u.created_at DESC`,
    );
    return {
      ok: true as const,
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        role: row.role,
        status: row.status,
        createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
        updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
        lastSessionAt: fromMySqlDateTime(row.lastSessionAt),
        activeSessionCount: Number(row.activeSessionCount) || 0,
        billing: {
          subscriptionStatus: row.subscriptionStatus,
          currentPeriodEnd: fromMySqlDateTime(row.currentPeriodEnd),
          planCode: row.planCode,
          planName: row.planName,
        },
      })),
    };
  }

  async listSubscriptions(limit = 50) {
    const safeLimit = clampLimit(limit);
    const [rows] = await this.pool.query<SubscriptionRow[]>(
      `SELECT s.id, s.user_id AS userId, u.email, u.display_name AS displayName,
              s.status, s.current_period_start AS currentPeriodStart, s.current_period_end AS currentPeriodEnd,
              s.cancel_at_period_end AS cancelAtPeriodEnd, s.created_at AS createdAt,
              p.code, p.name, p.billing_interval AS billingInterval, p.price_minor AS priceMinor, p.currency
       FROM billing_subscriptions s
       JOIN users u ON u.id = s.user_id
       JOIN billing_plans p ON p.id = s.plan_id
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [safeLimit],
    );
    return {
      ok: true as const,
      subscriptions: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        email: row.email,
        displayName: row.displayName,
        status: row.status,
        cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
        currentPeriodStart: fromMySqlDateTime(row.currentPeriodStart) ?? new Date(0).toISOString(),
        currentPeriodEnd: fromMySqlDateTime(row.currentPeriodEnd) ?? new Date(0).toISOString(),
        createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
        plan: {
          code: row.code,
          name: row.name,
          interval: row.billingInterval,
          priceMinor: row.priceMinor,
          currency: row.currency,
        },
      })),
    };
  }

  async listSessions(limit = 50) {
    const safeLimit = clampLimit(limit);
    const [rows] = await this.pool.query<SessionRow[]>(
      `SELECT s.id, s.user_id AS userId, u.email, u.display_name AS displayName,
              s.expires_at AS expiresAt, s.last_used_at AS lastUsedAt, s.revoked_at AS revokedAt, s.created_at AS createdAt
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.last_used_at DESC
       LIMIT ?`,
      [safeLimit],
    );
    return {
      ok: true as const,
      sessions: rows.map((row) => {
        const expiresAt = fromMySqlDateTime(row.expiresAt) ?? new Date(0).toISOString();
        const revokedAt = fromMySqlDateTime(row.revokedAt);
        return {
          id: row.id,
          userId: row.userId,
          email: row.email,
          displayName: row.displayName,
          expiresAt,
          lastUsedAt: fromMySqlDateTime(row.lastUsedAt) ?? new Date(0).toISOString(),
          revokedAt,
          createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
          status: revokedAt ? "revoked" : expiresAt <= new Date().toISOString() ? "expired" : "active",
        };
      }),
    };
  }

  async updateUserAccess(
    userId: string,
    input: UpdateUserAccessInput,
    actor: { userId: string; role: string },
  ) {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT id, role, status FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const current = rows[0];
    if (!current) return null;

    const nextRole = input.role ?? current.role;
    const nextStatus = input.status ?? current.status;
    validateRole(nextRole);
    validateStatus(nextStatus);

    if (actor.role !== "owner" && nextRole !== current.role) {
      throw new PlannerValidationError("Only the owner can change account roles");
    }
    if (actor.role !== "owner" && current.role === "owner") {
      throw new PlannerValidationError("Only the owner can manage the owner account");
    }
    if (current.id === actor.userId && current.role === "owner" && (nextRole !== "owner" || nextStatus !== "active")) {
      throw new PlannerValidationError("The owner account cannot demote or suspend itself");
    }

    await this.pool.query(`UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ?`, [
      nextRole,
      nextStatus,
      toMySqlDateTime(new Date()),
      userId,
    ]);

    const [updatedRows] = await this.pool.query<UserRow[]>(
      `SELECT id, role, status FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    return updatedRows[0] ?? null;
  }
}

async function countQuery(pool: Pool, query: string, params: unknown[] = []) {
  const [rows] = await pool.query<CountRow[]>(query, params);
  return Number(rows[0]?.value ?? 0);
}

function clampLimit(limit: number) {
  return Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 200)) : 50;
}

function validateRole(role: string) {
  if (!["member", "admin", "owner"].includes(role)) {
    throw new PlannerValidationError("Role must be member, admin, or owner");
  }
}

function validateStatus(status: string) {
  if (!["active", "suspended"].includes(status)) {
    throw new PlannerValidationError("Status must be active or suspended");
  }
}
