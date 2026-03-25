import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { fromMySqlDateTime, toMySqlDateTime } from "../db/time.js";
import { createDefaultPlannerData } from "./defaultData.js";
import type {
  PlannerData,
  RoutineAssignmentRule,
  Todo,
  TrackingType,
  ActiveDay,
} from "./types.js";
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
      const data = await this.readWithConnection(connection);
      if (hasPlannerData(data)) {
        return data;
      }
      const seed = this.seedFactory();
      await this.writeWithConnection(connection, seed);
      return seed;
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

  private async readWithConnection(connection: PoolConnection): Promise<PlannerData> {
    const [routineRows] = await connection.query<
      (RowDataPacket & {
        id: string;
        name: string;
        emoji: string | null;
        color: string;
        isArchived: number;
        createdAt: string;
        updatedAt: string;
      })[]
    >(
      `SELECT id, name, emoji, color, is_archived AS isArchived, created_at AS createdAt, updated_at AS updatedAt
       FROM planner_routines WHERE owner_user_id = ? ORDER BY created_at, id`,
      [this.ownerUserId],
    );
    const [itemRows] = await connection.query<
      (RowDataPacket & {
        id: string;
        routineId: string;
        title: string;
        sortOrder: number;
        isActive: number;
        trackingType: TrackingType;
        targetCount: number;
      })[]
    >(
      `SELECT id, routine_id AS routineId, title, sort_order AS sortOrder, is_active AS isActive,
              tracking_type AS trackingType, target_count AS targetCount
       FROM planner_routine_items WHERE owner_user_id = ? ORDER BY routine_id, sort_order, id`,
      [this.ownerUserId],
    );
    const [checkinRows] = await connection.query<
      (RowDataPacket & { date: string; routineId: string; itemProgressJson: string; updatedAt: string })[]
    >(
      `SELECT date_key AS date, routine_id AS routineId, item_progress_json AS itemProgressJson, updated_at AS updatedAt
       FROM planner_routine_checkins WHERE owner_user_id = ? ORDER BY date_key, routine_id`,
      [this.ownerUserId],
    );
    const [setRows] = await connection.query<
      (RowDataPacket & { id: string; name: string; createdAt: string; updatedAt: string })[]
    >(
      `SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
       FROM planner_routine_sets WHERE owner_user_id = ? ORDER BY created_at, id`,
      [this.ownerUserId],
    );
    const [memberRows] = await connection.query<
      (RowDataPacket & { routineSetId: string; routineId: string; sortOrder: number })[]
    >(
      `SELECT routine_set_id AS routineSetId, routine_id AS routineId, sort_order AS sortOrder
       FROM planner_routine_set_members WHERE owner_user_id = ? ORDER BY routine_set_id, sort_order, routine_id`,
      [this.ownerUserId],
    );
    const [assignmentRows] = await connection.query<
      (RowDataPacket & {
        id: string;
        ruleType: RoutineAssignmentRule["ruleType"];
        daysJson: string;
        setId: string;
        createdAt: string;
        updatedAt: string;
      })[]
    >(
      `SELECT id, rule_type AS ruleType, days_json AS daysJson, set_id AS setId,
              created_at AS createdAt, updated_at AS updatedAt
       FROM planner_assignment_rules WHERE owner_user_id = ? ORDER BY created_at, id`,
      [this.ownerUserId],
    );
    const [overrideRows] = await connection.query<
      (RowDataPacket & { date: string; setId: string | null; updatedAt: string })[]
    >(
      `SELECT date_key AS date, set_id AS setId, updated_at AS updatedAt
       FROM planner_date_overrides WHERE owner_user_id = ? ORDER BY date_key`,
      [this.ownerUserId],
    );
    const [includeRows] = await connection.query<(RowDataPacket & { date: string; routineId: string })[]>(
      `SELECT date_key AS date, routine_id AS routineId
       FROM planner_override_includes WHERE owner_user_id = ? ORDER BY date_key, routine_id`,
      [this.ownerUserId],
    );
    const [excludeRows] = await connection.query<(RowDataPacket & { date: string; routineId: string })[]>(
      `SELECT date_key AS date, routine_id AS routineId
       FROM planner_override_excludes WHERE owner_user_id = ? ORDER BY date_key, routine_id`,
      [this.ownerUserId],
    );
    const [todoRows] = await connection.query<
      (RowDataPacket & {
        id: string;
        title: string;
        emoji: string | null;
        note: string | null;
        dueDate: string | null;
        status: Todo["status"];
        completedAt: string | null;
        createdAt: string;
        updatedAt: string;
      })[]
    >(
      `SELECT id, title, emoji, note, due_date AS dueDate, status,
              completed_at AS completedAt, created_at AS createdAt, updated_at AS updatedAt
       FROM planner_todos WHERE owner_user_id = ? ORDER BY created_at, id`,
      [this.ownerUserId],
    );

    const setMembers = memberRows.reduce<Record<string, string[]>>((acc, row) => {
      acc[row.routineSetId] ??= [];
      acc[row.routineSetId].push(row.routineId);
      return acc;
    }, {});
    const includeMap = includeRows.reduce<Record<string, string[]>>((acc, row) => {
      acc[row.date] ??= [];
      acc[row.date].push(row.routineId);
      return acc;
    }, {});
    const excludeMap = excludeRows.reduce<Record<string, string[]>>((acc, row) => {
      acc[row.date] ??= [];
      acc[row.date].push(row.routineId);
      return acc;
    }, {});

    return {
      routines: routineRows.map((row) => ({
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        color: row.color,
        isArchived: Boolean(row.isArchived),
        createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
        updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
      })),
      routineItems: itemRows.map((row) => ({
        id: row.id,
        routineId: row.routineId,
        title: row.title,
        sortOrder: row.sortOrder,
        isActive: Boolean(row.isActive),
        trackingType: row.trackingType,
        targetCount: row.targetCount,
      })),
      routineCheckins: checkinRows.map((row) => ({
        date: row.date,
        routineId: row.routineId,
        itemProgress: normalizeRecord(row.itemProgressJson),
        updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
      })),
      routineSets: setRows.map((row) => ({
        id: row.id,
        name: row.name,
        routineIds: setMembers[row.id] ?? [],
        createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
        updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
      })),
      routineAssignmentRules: assignmentRows.map((row) => ({
        id: row.id,
        ruleType: row.ruleType,
        days: normalizeDays(row.daysJson),
        setId: row.setId,
        createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
        updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
      })),
      routineDateOverrides: overrideRows.map((row) => ({
        date: row.date,
        setId: row.setId,
        includeRoutineIds: includeMap[row.date] ?? [],
        excludeRoutineIds: excludeMap[row.date] ?? [],
        updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
      })),
      todos: todoRows.map((row) => ({
        id: row.id,
        title: row.title,
        emoji: row.emoji,
        note: row.note,
        dueDate: row.dueDate,
        status: row.status,
        completedAt: row.status === "done" ? fromMySqlDateTime(row.completedAt) : null,
        createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
        updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
      })),
    };
  }

  private async writeWithConnection(connection: PoolConnection, data: PlannerData) {
    await connection.beginTransaction();
    try {
      await connection.query(`DELETE FROM planner_override_excludes WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_override_includes WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_date_overrides WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_assignment_rules WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_routine_set_members WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_routine_sets WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_routine_checkins WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_routine_items WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_routines WHERE owner_user_id = ?`, [this.ownerUserId]);
      await connection.query(`DELETE FROM planner_todos WHERE owner_user_id = ?`, [this.ownerUserId]);

      for (const routine of data.routines) {
        await connection.query(
          `INSERT INTO planner_routines (owner_user_id, id, name, emoji, color, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.ownerUserId,
            routine.id,
            routine.name,
            routine.emoji,
            routine.color,
            routine.isArchived ? 1 : 0,
            toMySqlDateTime(routine.createdAt),
            toMySqlDateTime(routine.updatedAt),
          ],
        );
      }

      for (const item of data.routineItems) {
        await connection.query(
          `INSERT INTO planner_routine_items (owner_user_id, id, routine_id, title, sort_order, is_active, tracking_type, target_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [this.ownerUserId, item.id, item.routineId, item.title, item.sortOrder, item.isActive ? 1 : 0, item.trackingType, item.targetCount],
        );
      }

      for (const checkin of data.routineCheckins) {
        await connection.query(
          `INSERT INTO planner_routine_checkins (owner_user_id, date_key, routine_id, item_progress_json, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [this.ownerUserId, checkin.date, checkin.routineId, JSON.stringify(checkin.itemProgress), toMySqlDateTime(checkin.updatedAt)],
        );
      }

      for (const set of data.routineSets) {
        await connection.query(
          `INSERT INTO planner_routine_sets (owner_user_id, id, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [this.ownerUserId, set.id, set.name, toMySqlDateTime(set.createdAt), toMySqlDateTime(set.updatedAt)],
        );
        for (const [index, routineId] of set.routineIds.entries()) {
          await connection.query(
            `INSERT INTO planner_routine_set_members (owner_user_id, routine_set_id, routine_id, sort_order)
             VALUES (?, ?, ?, ?)`,
            [this.ownerUserId, set.id, routineId, index + 1],
          );
        }
      }

      for (const rule of data.routineAssignmentRules) {
        await connection.query(
          `INSERT INTO planner_assignment_rules (owner_user_id, id, rule_type, days_json, set_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            this.ownerUserId,
            rule.id,
            rule.ruleType,
            JSON.stringify(rule.days),
            rule.setId,
            toMySqlDateTime(rule.createdAt),
            toMySqlDateTime(rule.updatedAt),
          ],
        );
      }

      for (const override of data.routineDateOverrides) {
        await connection.query(
          `INSERT INTO planner_date_overrides (owner_user_id, date_key, set_id, updated_at)
           VALUES (?, ?, ?, ?)`,
          [this.ownerUserId, override.date, override.setId, toMySqlDateTime(override.updatedAt)],
        );
        for (const routineId of override.includeRoutineIds) {
          await connection.query(
            `INSERT INTO planner_override_includes (owner_user_id, date_key, routine_id) VALUES (?, ?, ?)`,
            [this.ownerUserId, override.date, routineId],
          );
        }
        for (const routineId of override.excludeRoutineIds) {
          await connection.query(
            `INSERT INTO planner_override_excludes (owner_user_id, date_key, routine_id) VALUES (?, ?, ?)`,
            [this.ownerUserId, override.date, routineId],
          );
        }
      }

      for (const todo of data.todos) {
        await connection.query(
          `INSERT INTO planner_todos (owner_user_id, id, title, emoji, note, due_date, status, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.ownerUserId,
            todo.id,
            todo.title,
            todo.emoji,
            todo.note,
            todo.dueDate,
            todo.status,
            todo.completedAt ? toMySqlDateTime(todo.completedAt) : null,
            toMySqlDateTime(todo.createdAt),
            toMySqlDateTime(todo.updatedAt),
          ],
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
}

function hasPlannerData(data: PlannerData) {
  return data.routines.length > 0 || data.todos.length > 0 || data.routineSets.length > 0;
}

function normalizeRecord(value: unknown): Record<string, number> {
  try {
    const parsed =
      typeof value === "string"
        ? (JSON.parse(value) as Record<string, unknown>)
        : ((value ?? {}) as Record<string, unknown>);
    return Object.fromEntries(Object.entries(parsed).map(([key, current]) => [key, Number(current) || 0]));
  } catch {
    return {};
  }
}

function normalizeDays(value: unknown): ActiveDay[] {
  try {
    const parsed = typeof value === "string" ? (JSON.parse(value) as number[]) : [];
    return parsed.filter((entry): entry is ActiveDay => Number.isInteger(entry) && entry >= 0 && entry <= 6);
  } catch {
    return [];
  }
}
