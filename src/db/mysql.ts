import mysql, { type Pool } from "mysql2/promise";
import type { AppConfig } from "../config.js";

export interface BillingPlanSeed {
  code: string;
  name: string;
  description: string;
  interval: "month" | "year";
  priceMinor: number;
  currency: string;
}

export const DEFAULT_BILLING_PLANS: BillingPlanSeed[] = [
  {
    code: "free",
    name: "Free",
    description: "Single-user local planning with manual billing disabled.",
    interval: "month",
    priceMinor: 0,
    currency: "KRW",
  },
  {
    code: "pro-monthly",
    name: "Pro Monthly",
    description: "Production subscription placeholder for monthly app billing.",
    interval: "month",
    priceMinor: 4900,
    currency: "KRW",
  },
  {
    code: "pro-yearly",
    name: "Pro Yearly",
    description: "Production subscription placeholder for yearly app billing.",
    interval: "year",
    priceMinor: 49000,
    currency: "KRW",
  },
];

export function createMySqlPool(config: AppConfig): Pool {
  return mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    connectionLimit: config.mysql.connectionLimit,
    waitForConnections: true,
    namedPlaceholders: true,
    decimalNumbers: true,
    dateStrings: true,
  });
}

export async function ensureDatabase(config: AppConfig) {
  try {
    const existing = await mysql.createConnection({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
    });
    await existing.end();
    return;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code && code !== "ER_BAD_DB_ERROR") {
      throw error;
    }
  }

  const connection = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
  });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}

export async function ensureMySqlSchema(pool: Pool) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'owner',
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME(3) NOT NULL,
      last_used_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL,
      CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS billing_plans (
      id VARCHAR(36) PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      billing_interval VARCHAR(16) NOT NULL,
      price_minor INT NOT NULL,
      currency VARCHAR(16) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS billing_customers (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL UNIQUE,
      provider VARCHAR(32) NOT NULL,
      provider_customer_id VARCHAR(255) NULL,
      status VARCHAR(32) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      CONSTRAINT fk_billing_customers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS billing_subscriptions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      plan_id VARCHAR(36) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      provider_subscription_id VARCHAR(255) NULL,
      status VARCHAR(32) NOT NULL,
      cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
      current_period_start DATETIME(3) NOT NULL,
      current_period_end DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      CONSTRAINT fk_billing_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES billing_plans(id)
    )`,
    `CREATE TABLE IF NOT EXISTS billing_invoices (
      id VARCHAR(36) PRIMARY KEY,
      subscription_id VARCHAR(36) NOT NULL,
      amount_minor INT NOT NULL,
      currency VARCHAR(16) NOT NULL,
      status VARCHAR(32) NOT NULL,
      issued_at DATETIME(3) NOT NULL,
      paid_at DATETIME(3) NULL,
      external_reference VARCHAR(255) NULL,
      created_at DATETIME(3) NOT NULL,
      CONSTRAINT fk_billing_invoices_subscription FOREIGN KEY (subscription_id) REFERENCES billing_subscriptions(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(36) PRIMARY KEY,
      actor_user_id VARCHAR(36) NULL,
      actor_role VARCHAR(32) NULL,
      target_user_id VARCHAR(36) NULL,
      scope VARCHAR(64) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      message VARCHAR(255) NOT NULL,
      details_json JSON NULL,
      created_at DATETIME(3) NOT NULL,
      INDEX idx_audit_logs_scope_created (scope, created_at),
      INDEX idx_audit_logs_actor_created (actor_user_id, created_at),
      INDEX idx_audit_logs_target_created (target_user_id, created_at),
      CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_audit_logs_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS planner_routines (
      owner_user_id VARCHAR(36) NOT NULL,
      id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      emoji VARCHAR(64) NULL,
      color VARCHAR(7) NOT NULL,
      is_archived TINYINT(1) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (owner_user_id, id),
      CONSTRAINT fk_planner_routines_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_routine_task_templates (
      owner_user_id VARCHAR(36) NOT NULL,
      id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      tracking_type VARCHAR(16) NOT NULL,
      target_count INT NOT NULL,
      is_archived TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (owner_user_id, id),
      CONSTRAINT fk_planner_routine_task_templates_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_routine_items (
      owner_user_id VARCHAR(36) NOT NULL,
      id VARCHAR(36) NOT NULL,
      routine_id VARCHAR(36) NOT NULL,
      template_id VARCHAR(36) NULL,
      title VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL,
      is_active TINYINT(1) NOT NULL,
      tracking_type VARCHAR(16) NOT NULL,
      target_count INT NOT NULL,
      PRIMARY KEY (owner_user_id, id),
      CONSTRAINT fk_planner_routine_items_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `ALTER TABLE planner_routine_items ADD COLUMN IF NOT EXISTS template_id VARCHAR(36) NULL AFTER routine_id`,
    `CREATE TABLE IF NOT EXISTS planner_routine_checkins (
      owner_user_id VARCHAR(36) NOT NULL,
      date_key CHAR(10) NOT NULL,
      routine_id VARCHAR(36) NOT NULL,
      item_progress_json JSON NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (owner_user_id, date_key, routine_id),
      CONSTRAINT fk_planner_routine_checkins_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_routine_sets (
      owner_user_id VARCHAR(36) NOT NULL,
      id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (owner_user_id, id),
      CONSTRAINT fk_planner_routine_sets_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_routine_set_members (
      owner_user_id VARCHAR(36) NOT NULL,
      routine_set_id VARCHAR(36) NOT NULL,
      routine_id VARCHAR(36) NOT NULL,
      sort_order INT NOT NULL DEFAULT 1,
      PRIMARY KEY (owner_user_id, routine_set_id, routine_id),
      CONSTRAINT fk_planner_routine_set_members_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_assignment_rules (
      owner_user_id VARCHAR(36) NOT NULL,
      id VARCHAR(36) NOT NULL,
      rule_type VARCHAR(24) NOT NULL,
      days_json JSON NOT NULL,
      set_id VARCHAR(36) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (owner_user_id, id),
      CONSTRAINT fk_planner_assignment_rules_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_date_overrides (
      owner_user_id VARCHAR(36) NOT NULL,
      date_key CHAR(10) NOT NULL,
      set_id VARCHAR(36) NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (owner_user_id, date_key),
      CONSTRAINT fk_planner_date_overrides_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_override_includes (
      owner_user_id VARCHAR(36) NOT NULL,
      date_key CHAR(10) NOT NULL,
      routine_id VARCHAR(36) NOT NULL,
      PRIMARY KEY (owner_user_id, date_key, routine_id),
      CONSTRAINT fk_planner_override_includes_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_override_excludes (
      owner_user_id VARCHAR(36) NOT NULL,
      date_key CHAR(10) NOT NULL,
      routine_id VARCHAR(36) NOT NULL,
      PRIMARY KEY (owner_user_id, date_key, routine_id),
      CONSTRAINT fk_planner_override_excludes_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS planner_todos (
      owner_user_id VARCHAR(36) NOT NULL,
      id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      emoji VARCHAR(64) NULL,
      note TEXT NULL,
      due_date CHAR(10) NULL,
      status VARCHAR(16) NOT NULL,
      completed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (owner_user_id, id),
      CONSTRAINT fk_planner_todos_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }
}
