const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, "0");
}

export function normalizeHashPath(path) {
  const normalized = String(path || "/today").trim();
  const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const clean = withSlash.replace(/\/+/g, "/").replace(/\/$/, "");
  return clean || "/today";
}

export function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    return false;
  }

  const parsed = parseDateKey(value);
  return Number.isFinite(parsed.getTime()) && formatDateKey(parsed) === value;
}

export function addDaysToDateKey(dateKey, amount) {
  const next = new Date(parseDateKey(dateKey).getTime() + DAY_MS * amount);
  return formatDateKey(next);
}

export function getMondayWeekStart(dateKey) {
  const date = parseDateKey(dateKey);
  const utcDay = date.getUTCDay();
  const mondayOffset = utcDay === 0 ? -6 : 1 - utcDay;
  return addDaysToDateKey(dateKey, mondayOffset);
}

export function buildWeekDates(dateKey) {
  const start = getMondayWeekStart(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(start, index));
}

export function parseHashRoute(route = "/today") {
  const raw = String(route || "/today").trim();
  const [rawPath, rawSearch = ""] = raw.split("?");
  const pathname = normalizeHashPath(rawPath);
  const search = new URLSearchParams(rawSearch);
  const date = search.get("date") || "";

  return {
    pathname,
    date: isValidDateKey(date) ? date : "",
  };
}

export function buildTodayRoute(date = "") {
  return isValidDateKey(date) ? `/today?date=${date}` : "/today";
}
