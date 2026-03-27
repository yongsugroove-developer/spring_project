export function normalizeHashPath(path: string): string;
export function parseDateKey(value: string): Date;
export function formatDateKey(date: Date): string;
export function isValidDateKey(value: string): boolean;
export function addDaysToDateKey(dateKey: string, amount: number): string;
export function getMondayWeekStart(dateKey: string): string;
export function buildWeekDates(dateKey: string): string[];
export function parseHashRoute(route?: string): { pathname: string; date: string };
export function buildTodayRoute(date?: string): string;
