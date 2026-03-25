import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { fromMySqlDateTime, toMySqlDateTime } from "../db/time.js";
import { PlannerValidationError, normalizeOptionalText, requireText } from "../planner/validation.js";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: string;
  token: string;
  expiresAt: string;
}

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionLookupRow extends RowDataPacket {
  sessionId: string;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  constructor(
    private readonly pool: Pool,
    private readonly sessionTtlHours: number,
  ) {}

  async ensureBootstrapUser(input: RegisterInput) {
    const existing = await this.findUserByEmail(input.email);
    if (existing) {
      return existing;
    }
    return this.createUser(input, "owner");
  }

  async register(input: RegisterInput) {
    const existing = await this.findUserByEmail(input.email);
    if (existing) {
      throw new PlannerValidationError("Email is already registered");
    }
    const user = await this.createUser(input, "member");
    const session = await this.createSession(user.id);
    return { user, session };
  }

  async login(input: LoginInput) {
    const userRow = await this.findUserRowByEmail(input.email);
    if (!userRow) {
      throw new PlannerValidationError("Invalid email or password");
    }
    if (userRow.status !== "active") {
      throw new PlannerValidationError("This account is not active");
    }
    const isValid = await bcrypt.compare(input.password, userRow.passwordHash);
    if (!isValid) {
      throw new PlannerValidationError("Invalid email or password");
    }
    const user = mapUser(userRow);
    const session = await this.createSession(user.id);
    return { user, session };
  }

  async resolveSession(token: string) {
    const tokenHash = sha256(token);
    const [rows] = await this.pool.query<SessionLookupRow[]>(
      `SELECT s.id AS sessionId, s.user_id AS userId, s.expires_at AS expiresAt, s.revoked_at AS revokedAt,
              u.id, u.email, u.password_hash AS passwordHash, u.display_name AS displayName,
              u.role, u.status, u.created_at AS createdAt, u.updated_at AS updatedAt
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
       LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    const expiresAt = fromMySqlDateTime(row?.expiresAt ?? null);
    if (!row || row.status !== "active" || row.revokedAt || !expiresAt || expiresAt <= new Date().toISOString()) {
      return null;
    }

    await this.pool.query(`UPDATE auth_sessions SET last_used_at = ? WHERE id = ?`, [toMySqlDateTime(new Date()), row.sessionId]);
    return mapUser(row);
  }

  async logout(token: string) {
    await this.pool.query(`UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?`, [
      toMySqlDateTime(new Date()),
      sha256(token),
    ]);
  }

  async getUserById(userId: string) {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT id, email, password_hash AS passwordHash, display_name AS displayName, role, status,
              created_at AS createdAt, updated_at AS updatedAt
       FROM users WHERE id = ?
       LIMIT 1`,
      [userId],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  private async createUser(input: RegisterInput, role: string) {
    const email = requireText(input.email.toLowerCase(), "Email");
    const password = requireText(input.password, "Password");
    if (password.length < 8) {
      throw new PlannerValidationError("Password must be at least 8 characters");
    }
    const now = new Date().toISOString();
    const user: AuthUser = {
      id: randomUUID(),
      email,
      displayName: normalizeOptionalText(input.displayName ?? null) ?? email.split("@")[0],
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const passwordHash = await bcrypt.hash(password, 12);
    await this.pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email,
        passwordHash,
        user.displayName,
        user.role,
        user.status,
        toMySqlDateTime(user.createdAt),
        toMySqlDateTime(user.updatedAt),
      ],
    );
    return user;
  }

  private async createSession(userId: string): Promise<AuthSession> {
    const token = `mpl_${randomBytes(24).toString("hex")}`;
    const now = new Date().toISOString();
    const session: AuthSession = {
      id: randomUUID(),
      token,
      expiresAt: new Date(Date.now() + this.sessionTtlHours * 60 * 60 * 1000).toISOString(),
    };
    await this.pool.query(
      `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        userId,
        sha256(token),
        toMySqlDateTime(session.expiresAt),
        toMySqlDateTime(now),
        toMySqlDateTime(now),
      ],
    );
    return session;
  }

  private async findUserByEmail(email: string) {
    const row = await this.findUserRowByEmail(email);
    return row ? mapUser(row) : null;
  }

  private async findUserRowByEmail(email: string) {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT id, email, password_hash AS passwordHash, display_name AS displayName, role, status,
              created_at AS createdAt, updated_at AS updatedAt
       FROM users WHERE email = ?
       LIMIT 1`,
      [email.toLowerCase()],
    );
    return rows[0] ?? null;
  }
}

function mapUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    createdAt: fromMySqlDateTime(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: fromMySqlDateTime(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
