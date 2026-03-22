const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatUtcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = parseDateKey(value);
  return Number.isFinite(parsed.getTime()) && value === formatUtcDateKey(parsed);
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export function getDayOfWeek(dateKey: string): number {
  return parseDateKey(dateKey).getUTCDay();
}

export function addDays(dateKey: string, amount: number): string {
  const next = new Date(parseDateKey(dateKey).getTime() + DAY_MS * amount);
  return formatUtcDateKey(next);
}

export function getMonthBounds(monthKey: string): { startDate: string; endDate: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  return {
    startDate: formatUtcDateKey(firstDay),
    endDate: formatUtcDateKey(lastDay),
  };
}

export function eachDateInRange(startDate: string, endDate: string): string[] {
  const values: string[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    values.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return values;
}

export function getWeekBounds(dateKey: string): { startDate: string; endDate: string } {
  const date = parseDateKey(dateKey);
  const utcDay = date.getUTCDay();
  const mondayOffset = utcDay === 0 ? -6 : 1 - utcDay;
  const startDate = formatUtcDateKey(new Date(date.getTime() + mondayOffset * DAY_MS));
  return {
    startDate,
    endDate: addDays(startDate, 6),
  };
}

export function getTodayKey(now: Date = new Date()): string {
  return formatDateKey(now);
}
