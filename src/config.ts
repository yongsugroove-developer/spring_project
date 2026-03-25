import dotenv from "dotenv";

dotenv.config();

export type StorageDriver = "json" | "mysql";

export interface AppConfig {
  storageDriver: StorageDriver;
  dataFile: string;
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
  };
  auth: {
    required: boolean;
    sessionTtlHours: number;
    bootstrapEmail: string;
    bootstrapPassword: string;
    bootstrapDisplayName: string;
  };
  billing: {
    provider: "manual";
    currency: string;
  };
}

function envNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function loadConfig(defaultDataFile: string): AppConfig {
  return {
    storageDriver: process.env.STORAGE_DRIVER === "json" ? "json" : "mysql",
    dataFile: process.env.PLANNER_DATA_FILE || defaultDataFile,
    mysql: {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: envNumber(process.env.MYSQL_PORT, 3307),
      user: process.env.MYSQL_USER || "planner_local",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "my_planner",
      connectionLimit: envNumber(process.env.MYSQL_CONNECTION_LIMIT, 10),
    },
    auth: {
      required: envBoolean(process.env.AUTH_REQUIRED, false),
      sessionTtlHours: envNumber(process.env.AUTH_SESSION_TTL_HOURS, 24 * 30),
      bootstrapEmail: process.env.BOOTSTRAP_ADMIN_EMAIL || "owner@my-planner.local",
      bootstrapPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || "ChangeMe1234!",
      bootstrapDisplayName: process.env.BOOTSTRAP_ADMIN_NAME || "Planner Owner",
    },
    billing: {
      provider: "manual",
      currency: process.env.BILLING_CURRENCY || "KRW",
    },
  };
}
