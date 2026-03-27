import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { fromMySqlDateTime, toMySqlDateTime } from "../db/time.js";
import { createDefaultPlannerData } from "./defaultData.js";
import { normalizePlannerData } from "./repository.js";
import type { PlannerData } from "./types.js";
import type { PlannerRepository } from "./repository.js";

export class MySqlPlannerRepository implements PlannerRepository {
  constructor(
    private readonly pool: Pool,
    private readonly ownerUserId: string,
    private readonly seedFactory: () => PlannerData = createDefaultPlannerData,
  ) {}

  async read(): Promise<PlannerData> {
    const connection = await this.pool.getConnection();
    try {
      const document = await this.readDocument(connection);
      if (document) {
        return document;
      }

      const legacy = await this.readLegacyData(connection);
      const { data } = normalizePlannerData(legacy, this.seedFactory);
      await this.writeWithConnection(connection, data);
      return data;
    } finally {
      connection.release();
    }
  }

  async write(data: PlannerData): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await this.writeWithConnection(connection, data);
    } finally {
      connection.release();
    }
  }

  private async readDocument(connection: PoolConnection): Promise<PlannerData | null> {
    const tableExists = await this.tableExists(connection, "planner_documents");
    if (!tableExists) {
      return null;
    }

    const [rows] = await connection.query<
      (RowDataPacket & { dataJson: unknown | null })[]
    >(
      `SELECT data_json AS dataJson
         FROM planner_documents
        WHERE owner_user_id = ?
        LIMIT 1`,
      [this.ownerUserId],
    );

    if (!Array.isArray(rows) || rows.length === 0 || !rows[0].dataJson) {
      return null;
    }

    const parsed = parseStoredDocument(rows[0].dataJson);
    if (parsed === null) {
      return null;
    }

    return normalizePlannerData(parsed, this.seedFactory).data;
  }

  private async writeWithConnection(connection: PoolConnection, data: PlannerData) {
    await connection.query(
      `INSERT INTO planner_documents (owner_user_id, data_json, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = VALUES(updated_at)`,
      [this.ownerUserId, JSON.stringify(data), toMySqlDateTime(new Date().toISOString())],
    );
  }

  private async readLegacyData(connection: PoolConnection): Promise<unknown> {
    const legacyTables = await this.getExistingLegacyTables(connection);
    if (legacyTables.size === 0) {
      return this.seedFactory();
    }

    const routines = legacyTables.has("planner_routines")
      ? await this.readLegacyRoutines(connection)
      : [];
    const templates = legacyTables.has("planner_routine_task_templates")
      ? await this.readLegacyTemplates(connection)
      : [];
    const items = legacyTables.has("planner_routine_items")
      ? await this.readLegacyItems(connection)
      : [];
    const checkins = legacyTables.has("planner_routine_checkins")
      ? await this.readLegacyCheckins(connection)
      : [];
    const todos = legacyTables.has("planner_todos")
      ? await this.readLegacyTodos(connection)
      : [];

    return {
      routines,
      routineTaskTemplates: templates,
      routineItems: items,
      routineCheckins: checkins,
      todos,
    };
  }

  private async getExistingLegacyTables(connection: PoolConnection): Promise<Set<string>> {
    const candidateTables = [
      "planner_routines",
      "planner_routine_task_templates",
      "planner_routine_items",
      "planner_routine_checkins",
      "planner_todos",
    ];
    const [rows] = await connection.query<(RowDataPacket & { tableName: string })[]>(
      `SELECT table_name AS tableName
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${candidateTables.map(() => "?").join(", ")})`,
      candidateTables,
    );
    return new Set(rows.map((row) => row.tableName));
  }

  private async tableExists(connection: PoolConnection, tableName: string) {
    const [rows] = await connection.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = ?
        LIMIT 1`,
      [tableName],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async readLegacyRoutines(connection: PoolConnection) {
    const [rows] = await connection.query<
      (RowDataPacket & {
        id: string;
        name: string;
        emoji: string | null;
        color: string;
        createdAt: string;
        updatedAt: string;
      })[]
    >(
      `SELECT id, name, emoji, color, created_at AS createdAt, updated_at AS updatedAt
         FROM planner_routines
        WHERE owner_user_id = ?
        ORDER BY created_at, id`,
      [this.ownerUserId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      color: row.color,
      createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
      updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
    }));
  }

  private async readLegacyTemplates(connection: PoolConnection) {
    const [rows] = await connection.query<
      (RowDataPacket & {
        id: string;
        title: string;
        trackingType: string;
        targetCount: number;
        createdAt: string;
        updatedAt: string;
      })[]
    >(
      `SELECT id, title, tracking_type AS trackingType, target_count AS targetCount,
              created_at AS createdAt, updated_at AS updatedAt
         FROM planner_routine_task_templates
        WHERE owner_user_id = ?
        ORDER BY created_at, id`,
      [this.ownerUserId],
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      trackingType: row.trackingType,
      targetCount: row.targetCount,
      createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
      updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
    }));
  }

  private async readLegacyItems(connection: PoolConnection) {
    const [rows] = await connection.query<
      (RowDataPacket & {
        id: string;
        routineId: string;
        templateId: string | null;
        title: string;
        sortOrder: number;
        trackingType: string;
        targetCount: number;
      })[]
    >(
      `SELECT id, routine_id AS routineId, template_id AS templateId, title,
              sort_order AS sortOrder, tracking_type AS trackingType, target_count AS targetCount
         FROM planner_routine_items
        WHERE owner_user_id = ?
        ORDER BY routine_id, sort_order, id`,
      [this.ownerUserId],
    );

    return rows.map((row) => ({
      id: row.id,
      routineId: row.routineId,
      templateId: row.templateId,
      title: row.title,
      sortOrder: row.sortOrder,
      trackingType: row.trackingType,
      targetCount: row.targetCount,
    }));
  }

  private async readLegacyCheckins(connection: PoolConnection) {
    const [rows] = await connection.query<
      (RowDataPacket & {
        date: string;
        routineId: string;
        itemProgressJson: string;
        updatedAt: string;
      })[]
    >(
      `SELECT date_key AS date, routine_id AS routineId, item_progress_json AS itemProgressJson,
              updated_at AS updatedAt
         FROM planner_routine_checkins
        WHERE owner_user_id = ?
        ORDER BY date_key, routine_id`,
      [this.ownerUserId],
    );

    return rows.map((row) => ({
      date: row.date,
      routineId: row.routineId,
      itemProgress: normalizeRecord(row.itemProgressJson),
      updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
    }));
  }

  private async readLegacyTodos(connection: PoolConnection) {
    const [rows] = await connection.query<
      (RowDataPacket & {
        id: string;
        title: string;
        emoji: string | null;
        note: string | null;
        dueDate: string | null;
        status: "pending" | "done";
        completedAt: string | null;
        createdAt: string;
        updatedAt: string;
      })[]
    >(
      `SELECT id, title, emoji, note, due_date AS dueDate, status,
              completed_at AS completedAt, created_at AS createdAt, updated_at AS updatedAt
         FROM planner_todos
        WHERE owner_user_id = ?
        ORDER BY created_at, id`,
      [this.ownerUserId],
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      emoji: row.emoji,
      note: row.note,
      dueDate: row.dueDate,
      status: row.status,
      completedAt: row.status === "done" ? fromMySqlDateTime(row.completedAt) : null,
      createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
      updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
    }));
  }
}

function normalizeRecord(value: unknown): Record<string, number> {
  try {
    const parsed =
      typeof value === "string"
        ? (JSON.parse(value) as Record<string, unknown>)
        : ((value ?? {}) as Record<string, unknown>);
    return Object.fromEntries(
      Object.entries(parsed).map(([key, current]) => [key, Number(current) || 0]),
    );
  } catch {
    return {};
  }
}

function parseStoredDocument(value: unknown): unknown | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  if (value && typeof value === "object") {
    return value;
  }

  return null;
}
