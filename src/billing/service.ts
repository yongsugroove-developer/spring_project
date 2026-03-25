import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { fromMySqlDateTime, toMySqlDateTime } from "../db/time.js";
import { PlannerValidationError } from "../planner/validation.js";
import type { BillingPlanSeed } from "../db/mysql.js";

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  interval: "month" | "year";
  priceMinor: number;
  currency: string;
  isActive: boolean;
}

interface BillingPlanRow extends RowDataPacket {
  id: string;
  code: string;
  name: string;
  description: string;
  billingInterval: "month" | "year";
  priceMinor: number;
  currency: string;
  isActive: number;
}

export class BillingService {
  constructor(private readonly pool: Pool) {}

  async seedPlans(plans: BillingPlanSeed[]) {
    const now = new Date().toISOString();
    for (const plan of plans) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT id FROM billing_plans WHERE code = ? LIMIT 1`,
        [plan.code],
      );
      if (rows.length > 0) {
        await this.pool.query(
          `UPDATE billing_plans
           SET name = ?, description = ?, billing_interval = ?, price_minor = ?, currency = ?, is_active = 1, updated_at = ?
           WHERE code = ?`,
          [plan.name, plan.description, plan.interval, plan.priceMinor, plan.currency, toMySqlDateTime(now), plan.code],
        );
        continue;
      }
      await this.pool.query(
        `INSERT INTO billing_plans
           (id, code, name, description, billing_interval, price_minor, currency, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          randomUUID(),
          plan.code,
          plan.name,
          plan.description,
          plan.interval,
          plan.priceMinor,
          plan.currency,
          toMySqlDateTime(now),
          toMySqlDateTime(now),
        ],
      );
    }
  }

  async ensureCustomer(userId: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id FROM billing_customers WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    if (rows.length > 0) return;
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO billing_customers (id, user_id, provider, provider_customer_id, status, created_at, updated_at)
       VALUES (?, ?, 'manual', NULL, 'active', ?, ?)`,
      [randomUUID(), userId, toMySqlDateTime(now), toMySqlDateTime(now)],
    );
  }

  async listPlans() {
    const [rows] = await this.pool.query<BillingPlanRow[]>(
      `SELECT id, code, name, description, billing_interval AS billingInterval,
              price_minor AS priceMinor, currency, is_active AS isActive
       FROM billing_plans
       WHERE is_active = 1
       ORDER BY price_minor, code`,
    );
    return rows.map(mapPlan);
  }

  async getOverview(userId: string) {
    await this.ensureCustomer(userId);
    const plans = await this.listPlans();
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: string;
        status: string;
        cancelAtPeriodEnd: number;
        currentPeriodStart: string;
        currentPeriodEnd: string;
        code: string;
        name: string;
        description: string;
        billingInterval: "month" | "year";
        priceMinor: number;
        currency: string;
        isActive: number;
      })[]
    >(
      `SELECT s.id, s.status, s.cancel_at_period_end AS cancelAtPeriodEnd,
              s.current_period_start AS currentPeriodStart, s.current_period_end AS currentPeriodEnd,
              p.id AS planId, p.code, p.name, p.description, p.billing_interval AS billingInterval,
              p.price_minor AS priceMinor, p.currency, p.is_active AS isActive
       FROM billing_subscriptions s
       JOIN billing_plans p ON p.id = s.plan_id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId],
    );

    const activeSubscription = rows[0]
      ? {
          id: rows[0].id,
          status: rows[0].status,
          cancelAtPeriodEnd: Boolean(rows[0].cancelAtPeriodEnd),
          currentPeriodStart: fromMySqlDateTime(rows[0].currentPeriodStart) ?? new Date(0).toISOString(),
          currentPeriodEnd: fromMySqlDateTime(rows[0].currentPeriodEnd) ?? new Date(0).toISOString(),
          plan: mapPlan(rows[0]),
        }
      : null;

    return { ok: true as const, plans, subscription: activeSubscription };
  }

  async activateManualSubscription(userId: string, planCode: string) {
    await this.ensureCustomer(userId);
    const [planRows] = await this.pool.query<BillingPlanRow[]>(
      `SELECT id, code, name, description, billing_interval AS billingInterval,
              price_minor AS priceMinor, currency, is_active AS isActive
       FROM billing_plans
       WHERE code = ? AND is_active = 1
       LIMIT 1`,
      [planCode],
    );
    const plan = planRows[0];
    if (!plan) {
      throw new PlannerValidationError("Billing plan was not found");
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.billingInterval === "year") {
      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    } else {
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    }

    await this.pool.query(
      `UPDATE billing_subscriptions SET status = 'replaced', updated_at = ? WHERE user_id = ? AND status = 'active'`,
      [toMySqlDateTime(now), userId],
    );
    await this.pool.query(
      `INSERT INTO billing_subscriptions
         (id, user_id, plan_id, provider, provider_subscription_id, status, cancel_at_period_end,
          current_period_start, current_period_end, created_at, updated_at)
       VALUES (?, ?, ?, 'manual', NULL, 'active', 0, ?, ?, ?, ?)`,
      [
        randomUUID(),
        userId,
        plan.id,
        toMySqlDateTime(now),
        toMySqlDateTime(periodEnd),
        toMySqlDateTime(now),
        toMySqlDateTime(now),
      ],
    );
    return this.getOverview(userId);
  }
}

function mapPlan(row: BillingPlanRow): BillingPlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    interval: row.billingInterval,
    priceMinor: row.priceMinor,
    currency: row.currency,
    isActive: Boolean(row.isActive),
  };
}
