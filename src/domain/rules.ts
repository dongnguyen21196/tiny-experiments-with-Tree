import { addDays, datesBetween, isoWeekday, isISODate, minDate } from './dates';
import type { CheckIn, Commitment, Experiment, ISODate, Revision } from './types';
import { LIMITS } from './types';

export class DomainError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Dữ liệu đã được thay đổi ở nơi khác (ví dụ một tab khác). Hãy sao chép nội dung đang nhập, tải lại trang rồi thử lại.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export interface FieldErrors {
  [field: string]: string;
}

/** BR-01: điều kiện để bắt đầu một thử nghiệm. */
export function validateForStart(e: Pick<Experiment, 'curiosity' | 'action' | 'startDate' | 'endDate' | 'weekdays'>, today: ISODate): FieldErrors {
  const errs: FieldErrors = {};
  const cur = e.curiosity.trim();
  const act = e.action.trim();
  if (!cur) errs.curiosity = 'Hãy viết điều bạn muốn khám phá (một câu là đủ).';
  else if (cur.length > LIMITS.curiosity) errs.curiosity = `Tối đa ${LIMITS.curiosity} ký tự.`;
  if (!act) errs.action = 'Hãy chọn một hành động cụ thể.';
  else if (act.length > LIMITS.action) errs.action = `Tối đa ${LIMITS.action} ký tự.`;
  if (!e.startDate || !isISODate(e.startDate)) errs.startDate = 'Chọn ngày bắt đầu.';
  else if (e.startDate < today) errs.startDate = 'Ngày bắt đầu không được trước hôm nay.';
  if (!e.endDate || !isISODate(e.endDate)) errs.endDate = 'Chọn ngày kết thúc.';
  else if (e.startDate && isISODate(e.startDate) && e.endDate < e.startDate) errs.endDate = 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.';
  if (!e.weekdays.length) errs.weekdays = 'Chọn ít nhất một ngày trong tuần.';
  if (!errs.startDate && !errs.endDate && !errs.weekdays) {
    const any = datesBetween(e.startDate!, e.endDate!).some((d) => e.weekdays.includes(isoWeekday(d)));
    if (!any) errs.weekdays = 'Trong khoảng ngày đã chọn không có ngày nào khớp lịch.';
  }
  return errs;
}

export function phaseEnd(e: Experiment): ISODate | null {
  return e.effectiveEndDate ?? e.endDate;
}

/** BR-11: active và hôm nay đã vượt endDate → chờ phản tư (không tự Closed). */
export function shouldAwaitReflection(e: Experiment, today: ISODate): boolean {
  return e.status === 'active' && !!e.endDate && today > e.endDate;
}

export function isOpen(e: Experiment): boolean {
  return e.status === 'active' || e.status === 'awaiting_reflection';
}

export function sortRevisions(revs: Revision[]): Revision[] {
  return [...revs].sort((a, b) => a.number - b.number);
}

/** Revision có hiệu lực vào một ngày (bản mới nhất có effectiveDate ≤ ngày). */
export function revisionFor(revs: Revision[], date: ISODate): Revision | undefined {
  let found: Revision | undefined;
  for (const r of sortRevisions(revs)) {
    if (r.effectiveDate <= date) found = r;
  }
  return found ?? sortRevisions(revs)[0];
}

export function currentCommitment(e: Experiment): Commitment {
  return { action: e.action, weekdays: [...e.weekdays].sort(), endDate: e.endDate!, effectiveEndDate: e.effectiveEndDate };
}

export function isScheduled(revs: Revision[], date: ISODate): boolean {
  const r = revisionFor(revs, date);
  return !!r && r.after.weekdays.includes(isoWeekday(date));
}

/** BR-05: ngày được phép ghi nhận: trong giai đoạn thực hiện và ≤ hôm nay. */
export function canLogDate(e: Experiment, date: ISODate, today: ISODate): string | null {
  if (!e.startDate || e.status === 'draft') return 'Thử nghiệm chưa bắt đầu.';
  if (!isISODate(date)) return 'Ngày không hợp lệ.';
  if (date > today) return 'Không ghi nhận cho ngày trong tương lai.';
  if (date < e.startDate) return 'Ngày này trước khi thử nghiệm bắt đầu.';
  const end = phaseEnd(e);
  if (end && date > end) return 'Ngày này nằm ngoài giai đoạn thực hiện.';
  return null;
}

export type DayState = 'logged_tried' | 'logged_not_done' | 'not_logged' | 'off_schedule' | 'upcoming';

export interface DayRow {
  date: ISODate;
  scheduled: boolean;
  checkIn?: CheckIn;
  state: DayState;
}

/** Timeline giai đoạn thực hiện. BR-03: không có log = chưa ghi nhận, không tự gán bỏ lỡ. */
export function buildTimeline(e: Experiment, revs: Revision[], checkIns: CheckIn[], today: ISODate): DayRow[] {
  if (!e.startDate || !e.endDate) return [];
  const end = phaseEnd(e)!;
  const byDate = new Map(checkIns.map((c) => [c.occurrenceDate, c]));
  return datesBetween(e.startDate, end).map((date) => {
    const scheduled = isScheduled(revs, date);
    const checkIn = byDate.get(date);
    let state: DayState;
    if (checkIn) state = checkIn.outcome === 'tried' ? 'logged_tried' : 'logged_not_done';
    else if (date > today) state = 'upcoming';
    else state = scheduled ? 'not_logged' : 'off_schedule';
    return { date, scheduled, checkIn, state };
  });
}

export function scheduledCount(e: Experiment, revs: Revision[]): number {
  if (!e.startDate || !e.endDate) return 0;
  return datesBetween(e.startDate, phaseEnd(e)!).filter((d) => isScheduled(revs, d)).length;
}

export function remainingDays(e: Experiment, today: ISODate): number {
  const end = phaseEnd(e);
  if (!end || today > end) return 0;
  return datesBetween(minDate(today, end), end).length;
}

export function defaultEndDate(start: ISODate): ISODate {
  return addDays(start, 13);
}
