import type { ISODate } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Ngày hôm nay (YYYY-MM-DD) theo timezone IANA. Không cộng 24h để suy ngày. */
export function todayIn(timezone: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toUTC(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUTC(dt: Date): ISODate {
  return dt.toISOString().slice(0, 10);
}

/** Cộng ngày trên lịch (date-only, không bị DST ảnh hưởng). */
export function addDays(d: ISODate, n: number): ISODate {
  const dt = toUTC(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000);
}

/** ISO weekday: 1 = Thứ 2 … 7 = Chủ nhật */
export function isoWeekday(d: ISODate): number {
  const w = toUTC(d).getUTCDay();
  return w === 0 ? 7 : w;
}

export function datesBetween(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (start > end) return out;
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  } catch {
    return 'Asia/Ho_Chi_Minh';
  }
}

export const WEEKDAY_SHORT = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const WEEKDAY_LONG = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

export function formatDate(d: ISODate | null | undefined, withWeekday = true): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const base = `${day}/${m}/${y}`;
  return withWeekday ? `${WEEKDAY_LONG[isoWeekday(d)]}, ${base}` : base;
}

export function formatWeekdays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Mỗi ngày';
  if (sorted.join() === '1,2,3,4,5') return 'Thứ 2 – Thứ 6';
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

export function formatStamp(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('vi-VN');
  } catch {
    return s;
  }
}
