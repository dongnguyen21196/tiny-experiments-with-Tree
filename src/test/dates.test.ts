import { describe, expect, it } from 'vitest';
import { addDays, datesBetween, isISODate, isoWeekday, todayIn } from '../domain/dates';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-2-3')).toBe(false);
  });
  it('adds days across DST without drifting (TC-24)', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('computes ISO weekday', () => {
    expect(isoWeekday('2026-11-09')).toBe(1); // Monday
    expect(isoWeekday('2026-11-15')).toBe(7); // Sunday
  });
  it('gets today in a timezone around midnight', () => {
    const instant = new Date('2026-11-11T17:30:00Z'); // 00:30 ngày 12 ở Việt Nam
    expect(todayIn('Asia/Ho_Chi_Minh', instant)).toBe('2026-11-12');
    expect(todayIn('America/New_York', instant)).toBe('2026-11-11');
  });
  it('lists dates inclusive', () => {
    expect(datesBetween('2026-11-10', '2026-11-12')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(datesBetween('2026-11-12', '2026-11-10')).toEqual([]);
  });
});
