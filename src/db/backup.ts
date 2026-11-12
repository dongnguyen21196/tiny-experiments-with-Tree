import { APP_VERSION, SCHEMA_VERSION, db, nowUTC } from './db';
import { notifyChange } from './notify';
import { countBucket, track } from './telemetry';
import { isISODate, isValidTimezone } from '../domain/dates';
import type { CheckIn, Experiment, Reflection, Revision } from '../domain/types';
import { LIMITS } from '../domain/types';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const APP_ID = 'tiny-experiments-backup';

export interface BackupEnvelope {
  app: typeof APP_ID;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: {
    timezone: string;
    experiments: Experiment[];
    revisions: Revision[];
    checkins: CheckIn[];
    reflections: Reflection[];
  };
}

/** BR-20: JSON là bản sao lưu để khôi phục (plaintext). Không kèm telemetry. */
export async function buildBackup(): Promise<BackupEnvelope> {
  return db.transaction('r', [db.profile, db.experiments, db.revisions, db.checkins, db.reflections], async () => {
    const profile = await db.profile.get('local');
    return {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: nowUTC(),
      data: {
        timezone: profile?.timezone ?? 'Asia/Ho_Chi_Minh',
        experiments: await db.experiments.toArray(),
        revisions: await db.revisions.toArray(),
        checkins: await db.checkins.toArray(),
        reflections: await db.reflections.toArray(),
      },
    };
  });
}

export async function exportBackupJSON(): Promise<string> {
  const env = await buildBackup();
  await track('backup_action', { action: 'export', schemaVersion: SCHEMA_VERSION, itemCountBucket: countBucket(env.data.experiments.length) });
  return JSON.stringify(env, null, 2);
}

// ---------- Validate ----------

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number, min = 0): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);
const isStamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isWeekdays = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length > 0 && v.length <= 7 && v.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) && new Set(v).size === v.length;
const isDateOrNull = (v: unknown) => v === null || isISODate(v);

function fail(msg: string): never {
  throw new ImportError(msg);
}

function pick<T extends object>(src: Record<string, unknown>, keys: (keyof T)[]): T {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k as string] = src[k as string];
  return out as T;
}

function validCommitment(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.action, LIMITS.action) &&
    isWeekdays(v.weekdays) &&
    isISODate(v.endDate) &&
    isDateOrNull(v.effectiveEndDate)
  );
}

export interface ImportPreview {
  envelope: BackupEnvelope;
  counts: { experiments: number; checkins: number; reflections: number; revisions: number };
  exportedAt: string;
}

export function parseBackup(text: string, byteSize: number): ImportPreview {
  if (byteSize > MAX_IMPORT_BYTES) fail('File lớn hơn 5 MB — không phải bản sao lưu hợp lệ của app.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('File không phải JSON hợp lệ.');
  }
  if (!isObj(raw) || raw.app !== APP_ID) fail('Đây không phải file sao lưu của Tiny Experiments. (Lưu ý: file Markdown chỉ để đọc, không dùng để khôi phục.)');
  if (!isInt(raw.schemaVersion)) fail('Thiếu phiên bản schema.');
  if ((raw.schemaVersion as number) > SCHEMA_VERSION) fail('File được tạo bởi phiên bản app mới hơn. Hãy cập nhật app trước khi khôi phục.');
  if (!isObj(raw.data)) fail('Thiếu dữ liệu.');
  const d = raw.data;
  if (!isValidTimezone(d.timezone)) fail('Múi giờ trong file không hợp lệ.');
  for (const k of ['experiments', 'revisions', 'checkins', 'reflections']) if (!Array.isArray(d[k])) fail(`Thiếu danh sách ${k}.`);

  const experiments: Experiment[] = (d.experiments as unknown[]).map((x, i) => {
    if (!isObj(x)) fail(`Thử nghiệm #${i + 1} không hợp lệ.`);
    const ok =
      isId(x.id) &&
      (x.parentId === null || isId(x.parentId)) &&
      isStr(x.curiosity, LIMITS.curiosity) &&
      isStr(x.action, LIMITS.action) &&
      isDateOrNull(x.startDate) &&
      isDateOrNull(x.endDate) &&
      isDateOrNull(x.effectiveEndDate) &&
      Array.isArray(x.weekdays) &&
      (x.weekdays as unknown[]).every((w) => Number.isInteger(w) && (w as number) >= 1 && (w as number) <= 7) &&
      isValidTimezone(x.timezone) &&
      ['draft', 'active', 'awaiting_reflection', 'closed'].includes(x.status as string) &&
      isInt(x.version) &&
      isStamp(x.createdAt) &&
      isStamp(x.updatedAt);
    if (!ok) fail(`Thử nghiệm #${i + 1} có trường không hợp lệ.`);
    if (x.status !== 'draft') {
      if (!isISODate(x.startDate) || !isISODate(x.endDate) || !isWeekdays(x.weekdays) || (x.endDate as string) < (x.startDate as string))
        fail(`Thử nghiệm #${i + 1} thiếu lịch hợp lệ.`);
    }
    return pick<Experiment>(x, ['id', 'parentId', 'curiosity', 'action', 'startDate', 'endDate', 'effectiveEndDate', 'weekdays', 'timezone', 'status', 'version', 'createdAt', 'updatedAt']);
  });

  const ids = new Set<string>();
  for (const e of experiments) {
    if (ids.has(e.id)) fail('Có ID thử nghiệm bị trùng.');
    ids.add(e.id);
  }
  // parentId: không orphan, không vòng lặp
  const byId = new Map(experiments.map((e) => [e.id, e]));
  for (const e of experiments) {
    if (e.parentId && !byId.has(e.parentId)) fail('Có thử nghiệm liên kết tới vòng trước không tồn tại.');
    const seen = new Set<string>();
    let cur: Experiment | undefined = e;
    while (cur?.parentId) {
      if (seen.has(cur.id)) fail('Liên kết giữa các vòng bị lặp.');
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
  }
  if (experiments.filter((e) => e.status === 'active' || e.status === 'awaiting_reflection').length > 1)
    fail('File có nhiều hơn một thử nghiệm đang mở.');

  const revisions: Revision[] = (d.revisions as unknown[]).map((x, i) => {
    if (!isObj(x)) fail(`Lịch sử thay đổi #${i + 1} không hợp lệ.`);
    const ok =
      isId(x.id) &&
      isId(x.experimentId) &&
      ids.has(x.experimentId as string) &&
      Number.isInteger(x.number) &&
      (x.number as number) >= 1 &&
      ['baseline', 'amend', 'extend', 'end_early'].includes(x.changeType as string) &&
      isISODate(x.effectiveDate) &&
      (x.before === null || validCommitment(x.before)) &&
      validCommitment(x.after) &&
      (x.reason === null || isStr(x.reason, LIMITS.reason)) &&
      isStamp(x.createdAt);
    if (!ok) fail(`Lịch sử thay đổi #${i + 1} không hợp lệ hoặc trỏ tới thử nghiệm không tồn tại.`);
    return pick<Revision>(x, ['id', 'experimentId', 'number', 'changeType', 'effectiveDate', 'before', 'after', 'reason', 'createdAt']);
  });
  const revIds = new Set(revisions.map((r) => r.id));
  if (revIds.size !== revisions.length) fail('Có ID lịch sử thay đổi bị trùng.');
  for (const e of experiments) {
    if (e.status !== 'draft' && !revisions.some((r) => r.experimentId === e.id)) fail('Một thử nghiệm đã bắt đầu nhưng thiếu cam kết gốc.');
  }

  const dateKeys = new Set<string>();
  const checkins: CheckIn[] = (d.checkins as unknown[]).map((x, i) => {
    if (!isObj(x)) fail(`Ghi nhận #${i + 1} không hợp lệ.`);
    const ok =
      isId(x.id) &&
      isId(x.experimentId) &&
      ids.has(x.experimentId as string) &&
      isISODate(x.occurrenceDate) &&
      (x.outcome === 'tried' || x.outcome === 'not_done') &&
      isStr(x.observation, LIMITS.observation) &&
      isId(x.revisionId) &&
      revIds.has(x.revisionId as string) &&
      typeof x.editedAfterClose === 'boolean' &&
      isInt(x.version) &&
      isStamp(x.createdAt) &&
      isStamp(x.updatedAt);
    if (!ok) fail(`Ghi nhận #${i + 1} không hợp lệ hoặc trỏ tới dữ liệu không tồn tại.`);
    const key = `${x.experimentId}|${x.occurrenceDate}`;
    if (dateKeys.has(key)) fail('Có hai ghi nhận cho cùng một ngày của một thử nghiệm.');
    dateKeys.add(key);
    return pick<CheckIn>(x, ['id', 'experimentId', 'occurrenceDate', 'outcome', 'observation', 'revisionId', 'editedAfterClose', 'version', 'createdAt', 'updatedAt']);
  });

  const reflExp = new Set<string>();
  const reflections: Reflection[] = (d.reflections as unknown[]).map((x, i) => {
    if (!isObj(x)) fail(`Phần nhìn lại #${i + 1} không hợp lệ.`);
    const ok =
      isId(x.id) &&
      isId(x.experimentId) &&
      ids.has(x.experimentId as string) &&
      isStr(x.plus, LIMITS.reflectionField) &&
      isStr(x.minus, LIMITS.reflectionField) &&
      isStr(x.next, LIMITS.reflectionField) &&
      (x.clarity === null || x.clarity === 'some_learning' || x.clarity === 'unclear') &&
      (x.decision === null || ['continue', 'adjust', 'stop'].includes(x.decision as string)) &&
      isStr(x.rationale, LIMITS.rationale) &&
      (x.status === 'draft' || x.status === 'submitted') &&
      (x.firstSubmittedAt === null || isStamp(x.firstSubmittedAt)) &&
      isInt(x.version) &&
      isStamp(x.createdAt) &&
      isStamp(x.updatedAt);
    if (!ok) fail(`Phần nhìn lại #${i + 1} không hợp lệ.`);
    if (reflExp.has(x.experimentId as string)) fail('Một thử nghiệm có nhiều hơn một phần nhìn lại.');
    reflExp.add(x.experimentId as string);
    return pick<Reflection>(x, ['id', 'experimentId', 'plus', 'minus', 'next', 'clarity', 'decision', 'rationale', 'status', 'firstSubmittedAt', 'version', 'createdAt', 'updatedAt']);
  });

  const envelope: BackupEnvelope = {
    app: APP_ID,
    schemaVersion: raw.schemaVersion as number,
    appVersion: String(raw.appVersion ?? ''),
    exportedAt: isStamp(raw.exportedAt) ? (raw.exportedAt as string) : '',
    data: { timezone: d.timezone as string, experiments, revisions, checkins, reflections },
  };
  return {
    envelope,
    exportedAt: envelope.exportedAt,
    counts: { experiments: experiments.length, checkins: checkins.length, reflections: reflections.length, revisions: revisions.length },
  };
}

/** BR-17/18: chỉ Replace; một transaction all-or-nothing. Không nhập telemetry, không bật consent. */
export async function replaceImport(preview: ImportPreview): Promise<void> {
  const { data } = preview.envelope;
  try {
    await db.transaction('rw', [db.profile, db.experiments, db.revisions, db.checkins, db.reflections, db.eventKeys], async () => {
      await Promise.all([db.experiments.clear(), db.revisions.clear(), db.checkins.clear(), db.reflections.clear(), db.eventKeys.clear()]);
      await db.experiments.bulkAdd(data.experiments);
      await db.revisions.bulkAdd(data.revisions);
      await db.checkins.bulkAdd(data.checkins);
      await db.reflections.bulkAdd(data.reflections);
      await db.profile.update('local', { timezone: data.timezone, onboarded: true });
    });
  } catch (err) {
    await track('backup_action', { action: 'import_failed', schemaVersion: preview.envelope.schemaVersion, itemCountBucket: countBucket(data.experiments.length) });
    throw new ImportError('Không thể ghi dữ liệu khôi phục. Dữ liệu hiện tại được giữ nguyên.' + (err instanceof Error ? ` (${err.name})` : ''));
  }
  await track('backup_action', { action: 'import', schemaVersion: preview.envelope.schemaVersion, itemCountBucket: countBucket(data.experiments.length) });
  notifyChange();
}
