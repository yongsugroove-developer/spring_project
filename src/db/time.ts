function pad(value: number, length = 2) {
  return value.toString().padStart(length, "0");
}

export function toMySqlDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
}

export function fromMySqlDateTime(value: string | Date | null) {
  if (value === null) return null;
  const asText =
    value instanceof Date
      ? `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}.${pad(value.getUTCMilliseconds(), 3)}`
      : value;
  return asText.replace(" ", "T") + (asText.endsWith("Z") ? "" : "Z");
}
