const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Build a local Date and reject calendar overflow (e.g. 2024-02-30 → Mar 1). */
function localDate(y: number, mo: number, d: number, h = 0, mi = 0): Date | undefined {
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return undefined;
  }
  return date;
}

/** Parse a `yyyy-MM-dd` string into a local Date at midnight, or undefined. */
export function parseISODate(value: string | null | undefined): Date | undefined {
  const match = value?.match(ISO_DATE);
  if (!match) return undefined;
  return localDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Format a Date to `yyyy-MM-dd` using local components (no UTC drift). */
export function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse a `yyyy-MM-ddTHH:mm` string into a local Date, or undefined. */
export function parseISODateTime(value: string | null | undefined): Date | undefined {
  const match = value?.match(ISO_DATE_TIME);
  if (!match) return undefined;
  return localDate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}

/** Format a Date to `yyyy-MM-ddTHH:mm` using local components. */
export function formatISODateTime(date: Date): string {
  return `${formatISODate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
