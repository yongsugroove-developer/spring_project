import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { fromMySqlDateTime, toMySqlDateTime } from "../db/time.js";

export interface AuditLogInput {
  actorUserId?: string | null;
  actorRole?: string | null;
  targetUserId?: string | null;
  scope: string;
  eventType: string;
  message: string;
  details?: unknown;
}

interface AuditLogRow extends RowDataPacket {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  targetUserId: string | null;
  scope: string;
  eventType: string;
  message: string;
  detailsJson: string | null;
  createdAt: string;
  actorEmail: string | null;
  actorDisplayName: string | null;
  targetEmail: string | null;
  targetDisplayName: string | null;
}

export class AuditLogService {
  constructor(private readonly pool: Pool) {}

  async record(input: AuditLogInput) {
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO audit_logs
         (id, actor_user_id, actor_role, target_user_id, scope, event_type, message, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.actorUserId ?? null,
        input.actorRole ?? null,
        input.targetUserId ?? null,
        input.scope,
        input.eventType,
        input.message,
        input.details === undefined ? null : JSON.stringify(input.details),
        toMySqlDateTime(now),
      ],
    );
  }

  async listRecent(limit = 50) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 200)) : 50;
    const [rows] = await this.pool.query<AuditLogRow[]>(
      `SELECT l.id, l.actor_user_id AS actorUserId, l.actor_role AS actorRole, l.target_user_id AS targetUserId,
              l.scope, l.event_type AS eventType, l.message, l.details_json AS detailsJson, l.created_at AS createdAt,
              actor.email AS actorEmail, actor.display_name AS actorDisplayName,
              target.email AS targetEmail, target.display_name AS targetDisplayName
       FROM audit_logs l
       LEFT JOIN users actor ON actor.id = l.actor_user_id
       LEFT JOIN users target ON target.id = l.target_user_id
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [safeLimit],
    );
    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      eventType: row.eventType,
      message: row.message,
      actorRole: row.actorRole,
      createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
      details: parseJson(row.detailsJson),
      actor:
        row.actorUserId || row.actorEmail || row.actorDisplayName
          ? {
              id: row.actorUserId,
              email: row.actorEmail,
              displayName: row.actorDisplayName,
            }
          : null,
      target:
        row.targetUserId || row.targetEmail || row.targetDisplayName
          ? {
              id: row.targetUserId,
              email: row.targetEmail,
              displayName: row.targetDisplayName,
            }
          : null,
    }));
  }
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
