import { db, nowUTC, uuid } from './db';
import { notifyChange } from './notify';
import { pruneEvents, track, trackForExperiment, keyFor } from './telemetry';
import { now } from '../domain/clock';
import { deviceTimezone, isISODate, isValidTimezone, todayIn } from '../domain/dates';
import {
  ConflictError,
  DomainError,
  canLogDate,
  currentCommitment,
  isOpen,
  revisionFor,
  shouldAwaitReflection,
  validateForStart,
} from '../domain/rules';
import type {
  CheckIn,
  Clarity,
  Decision,
  Experiment,
  ISODate,
  Outcome,
  Profile,
  Reflection,
  Revision,
} from '../domain/types';
import { LIMITS } from '../domain/types';

export const todayFor = (tz: string): ISODate => todayIn(tz, now());

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

function clip(s: string, max: number, label: string): string {
  const v = s.trim();
  if (v.length > max) throw new DomainError(`${label}: tối đa ${max} ký tự.`);
  return v;
}

async function getExperimentOrThrow(id: string): Promise<Experiment> {
  const e = await db.experiments.get(id);
  if (!e) throw new DomainError('Không tìm thấy thử nghiệm (có thể đã bị xóa ở tab khác).');
  return e;
}

function checkVersion(e: { version: number }, expected: number | undefined) {
  if (expected !== undefined && e.version !== expected) throw new ConflictError();
}

// ---------- Profile ----------

export async function initializeProfile(): Promise<Profile> {
  try {
    await db.open();
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'VersionError') {
      throw new StorageUnavailableError(
        'Dữ liệu trên trình duyệt này được tạo bởi phiên bản app mới hơn. Ứng dụng không xóa hay ghi đè dữ liệu đó. Hãy mở bản app mới nhất.',
      );
    }
    throw new StorageUnavailableError(
      'Không mở được bộ nhớ của trình duyệt (có thể do chế độ ẩn danh, bộ nhớ đầy hoặc trình duyệt chặn lưu trữ). App sẽ không giả vờ lưu dữ liệu.',
    );
  }
  let profile = await db.profile.get('local');
  if (!profile) {
    profile = {
      id: 'local',
      installationId: uuid(),
      timezone: deviceTimezone(),
      telemetryConsent: false,
      onboarded: false,
      dismissedPrompts: [],
      createdAt: nowUTC(),
    };
    await db.profile.put(profile);
  }
  await refreshStatuses();
  await pruneEvents().catch(() => undefined);
  return profile;
}

export async function updateProfile(patch: Partial<Pick<Profile, 'timezone' | 'onboarded' | 'dismissedPrompts'>>) {
  if (patch.timezone !== undefined && !isValidTimezone(patch.timezone)) throw new DomainError('Múi giờ không hợp lệ.');
  await db.profile.update('local', patch);
  notifyChange();
}

export async function completeOnboarding(mode: 'new' | 'import') {
  await updateProfile({ onboarded: true });
  await track('onboarding_completed', { mode });
}

export async function setTelemetryConsent(consent: boolean, clearQueue: boolean) {
  await db.transaction('rw', db.profile, db.events, async () => {
    await db.profile.update('local', { telemetryConsent: consent });
    if (!consent && clearQueue) await db.events.clear();
  });
  notifyChange();
}

export async function dismissPrompt(promptType: string) {
  const p = await db.profile.get('local');
  if (!p) return;
  if (!p.dismissedPrompts.includes(promptType)) {
    await db.profile.update('local', { dismissedPrompts: [...p.dismissedPrompts, promptType] });
  }
  await track('prompt_dismissed', { promptType: promptType.split(':')[0] });
  notifyChange();
}

/** Đánh giá lại trạng thái khi mở app / qua ngày (không cần cron). */
export async function refreshStatuses(): Promise<void> {
  let changed = false;
  await db.transaction('rw', db.experiments, async () => {
    const active = await db.experiments.where('status').equals('active').toArray();
    for (const e of active) {
      if (shouldAwaitReflection(e, todayFor(e.timezone))) {
        await db.experiments.put({ ...e, status: 'awaiting_reflection', version: e.version + 1, updatedAt: nowUTC() });
        changed = true;
      }
    }
  });
  if (changed) notifyChange();
}

// ---------- Drafts & start ----------

export interface DraftInput {
  curiosity: string;
  action: string;
  startDate: ISODate | null;
  endDate: ISODate | null;
  weekdays: number[];
}

export async function createDraft(input: DraftInput, parentId: string | null = null): Promise<Experiment> {
  const profile = await db.profile.get('local');
  const ts = nowUTC();
  const e: Experiment = {
    id: uuid(),
    parentId,
    curiosity: clip(input.curiosity, LIMITS.curiosity, 'Điều muốn khám phá'),
    action: clip(input.action, LIMITS.action, 'Hành động'),
    startDate: input.startDate,
    endDate: input.endDate,
    effectiveEndDate: null,
    weekdays: [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7).sort(),
    timezone: profile?.timezone ?? deviceTimezone(),
    status: 'draft',
    version: 1,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.experiments.add(e);
  notifyChange();
  return e;
}

export async function saveDraft(id: string, input: DraftInput, expectedVersion: number): Promise<Experiment> {
  const updated = await db.transaction('rw', db.experiments, db.profile, async () => {
    const e = await getExperimentOrThrow(id);
    if (e.status !== 'draft') throw new DomainError('Thử nghiệm đã bắt đầu; dùng chức năng điều chỉnh thay vì sửa nháp.');
    checkVersion(e, expectedVersion);
    const profile = await db.profile.get('local');
    const next: Experiment = {
      ...e,
      curiosity: clip(input.curiosity, LIMITS.curiosity, 'Điều muốn khám phá'),
      action: clip(input.action, LIMITS.action, 'Hành động'),
      startDate: input.startDate,
      endDate: input.endDate,
      weekdays: [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7).sort(),
      timezone: profile?.timezone ?? e.timezone, // BR-16: draft theo timezone mặc định hiện tại
      version: e.version + 1,
      updatedAt: nowUTC(),
    };
    await db.experiments.put(next);
    return next;
  });
  notifyChange();
  return updated;
}

export async function startExperiment(id: string, expectedVersion: number): Promise<Experiment> {
  const started = await db.transaction('rw', db.experiments, db.revisions, async () => {
    const e = await getExperimentOrThrow(id);
    if (e.status !== 'draft') throw new DomainError('Thử nghiệm này đã được bắt đầu.');
    checkVersion(e, expectedVersion);
    const today = todayFor(e.timezone);
    const errs = validateForStart(e, today);
    const first = Object.values(errs)[0];
    if (first) throw new DomainError(first, Object.keys(errs)[0]);
    const open = (await db.experiments.toArray()).filter(isOpen);
    if (open.length > 0) {
      throw new DomainError('Bạn đang có một thử nghiệm chưa khép lại. Hãy nhìn lại hoặc dừng nó trước khi bắt đầu thử nghiệm mới.');
    }
    const ts = nowUTC();
    const next: Experiment = { ...e, status: 'active', version: e.version + 1, updatedAt: ts };
    await db.experiments.put(next);
    const baseline: Revision = {
      id: uuid(),
      experimentId: e.id,
      number: 1,
      changeType: 'baseline',
      effectiveDate: e.startDate!,
      before: null,
      after: currentCommitment(next),
      reason: null,
      createdAt: ts,
    };
    await db.revisions.add(baseline);
    return next;
  });
  notifyChange();
  await trackForExperiment('experiment_started', started.id, {
    startDate: started.startDate,
    endDate: started.endDate,
    scheduleType: started.weekdays.length === 7 ? 'daily' : 'weekdays',
    timezone: started.timezone,
  });
  return started;
}

// ---------- Check-ins ----------

export interface CheckInInput {
  experimentId: string;
  occurrenceDate: ISODate;
  outcome: Outcome;
  observation: string;
  /** undefined = tạo mới; số = sửa bản ghi có version này */
  expectedVersion?: number;
}

export async function upsertCheckIn(input: CheckInInput): Promise<CheckIn> {
  const observation = clip(input.observation, LIMITS.observation, 'Quan sát');
  if (input.outcome !== 'tried' && input.outcome !== 'not_done') throw new DomainError('Chọn “Đã thử” hoặc “Chưa thực hiện”.');
  let isEdit = false;
  const saved = await db.transaction('rw', db.experiments, db.checkins, db.revisions, async () => {
    const e = await getExperimentOrThrow(input.experimentId);
    const today = todayFor(e.timezone);
    const err = canLogDate(e, input.occurrenceDate, today);
    if (err) throw new DomainError(err);
    const existing = await db.checkins
      .where('[experimentId+occurrenceDate]')
      .equals([e.id, input.occurrenceDate])
      .first();
    const ts = nowUTC();
    if (existing) {
      if (input.expectedVersion === undefined || existing.version !== input.expectedVersion) throw new ConflictError(
        'Ngày này đã có ghi nhận (có thể vừa được lưu ở tab khác). Hãy sao chép nội dung, tải lại rồi sửa ghi nhận hiện có.',
      );
      isEdit = true;
      const next: CheckIn = {
        ...existing,
        outcome: input.outcome,
        observation,
        editedAfterClose: existing.editedAfterClose || e.status === 'closed',
        version: existing.version + 1,
        updatedAt: ts,
      };
      await db.checkins.put(next);
      return next;
    }
    if (input.expectedVersion !== undefined) throw new ConflictError('Ghi nhận bạn đang sửa không còn tồn tại. Hãy tải lại.');
    const revs = await db.revisions.where('experimentId').equals(e.id).toArray();
    const rev = revisionFor(revs, input.occurrenceDate);
    if (!rev) throw new DomainError('Thiếu lịch sử cam kết cho thử nghiệm này.');
    const ci: CheckIn = {
      id: uuid(),
      experimentId: e.id,
      occurrenceDate: input.occurrenceDate,
      outcome: input.outcome,
      observation,
      revisionId: rev.id,
      editedAfterClose: false,
      version: 1,
      createdAt: ts,
      updatedAt: ts,
    };
    await db.checkins.add(ci);
    return ci;
  });
  notifyChange();
  const e = await db.experiments.get(input.experimentId);
  await trackForExperiment('checkin_saved', input.experimentId, {
    logKey: await keyFor(saved.id),
    occurrenceDate: saved.occurrenceDate,
    outcome: saved.outcome,
    hasObservation: saved.observation.length > 0,
    isEdit,
    isLate: e ? saved.occurrenceDate < todayFor(e.timezone) : false,
  });
  return saved;
}

export async function deleteCheckIn(id: string) {
  await db.checkins.delete(id);
  notifyChange();
}

// ---------- Thay đổi khi đang chạy ----------

async function addRevision(e: Experiment, next: Experiment, changeType: Revision['changeType'], reason: string | null, effectiveDate: ISODate) {
  const count = await db.revisions.where('experimentId').equals(e.id).count();
  const rev: Revision = {
    id: uuid(),
    experimentId: e.id,
    number: count + 1,
    changeType,
    effectiveDate,
    before: currentCommitment(e),
    after: currentCommitment(next),
    reason: reason?.trim() ? clip(reason, LIMITS.reason, 'Lý do') : null,
    createdAt: nowUTC(),
  };
  await db.revisions.add(rev);
  return rev;
}

/** BR-09: đổi hành động / ngày trong tuần, hiệu lực từ hôm nay, không viết lại lịch sử. */
export async function amendCommitment(id: string, patch: { action: string; weekdays: number[] }, reason: string, expectedVersion: number) {
  const action = clip(patch.action, LIMITS.action, 'Hành động');
  if (!action) throw new DomainError('Hành động không được để trống.');
  const weekdays = [...new Set(patch.weekdays)].filter((d) => d >= 1 && d <= 7).sort();
  if (!weekdays.length) throw new DomainError('Chọn ít nhất một ngày trong tuần.');
  const result = await db.transaction('rw', db.experiments, db.revisions, async () => {
    const e = await getExperimentOrThrow(id);
    if (e.status !== 'active') throw new DomainError('Chỉ điều chỉnh được thử nghiệm đang chạy.');
    checkVersion(e, expectedVersion);
    if (action === e.action && weekdays.join() === [...e.weekdays].sort().join()) throw new DomainError('Chưa có thay đổi nào.');
    const today = todayFor(e.timezone);
    const next: Experiment = { ...e, action, weekdays, version: e.version + 1, updatedAt: nowUTC() };
    await db.experiments.put(next);
    const rev = await addRevision(e, next, 'amend', reason, today);
    return { next, rev };
  });
  notifyChange();
  await trackForExperiment('experiment_changed', id, { changeType: 'amend', revisionNumber: result.rev.number, effectiveEndDate: null });
  return result.next;
}

/** BR-07: dừng sớm bất cứ lúc nào, không bắt phản tư ngay. */
export async function endEarly(id: string, reason: string, expectedVersion: number) {
  const result = await db.transaction('rw', db.experiments, db.revisions, async () => {
    const e = await getExperimentOrThrow(id);
    if (e.status !== 'active') throw new DomainError('Thử nghiệm không ở trạng thái đang chạy.');
    checkVersion(e, expectedVersion);
    const today = todayFor(e.timezone);
    const effectiveEndDate = today < e.startDate! ? e.startDate! : today;
    const next: Experiment = {
      ...e,
      effectiveEndDate: effectiveEndDate < e.endDate! ? effectiveEndDate : null,
      status: 'awaiting_reflection',
      version: e.version + 1,
      updatedAt: nowUTC(),
    };
    await db.experiments.put(next);
    const rev = await addRevision(e, next, 'end_early', reason, today);
    return { next, rev };
  });
  notifyChange();
  await trackForExperiment('experiment_changed', id, {
    changeType: 'endEarly',
    revisionNumber: result.rev.number,
    effectiveEndDate: result.next.effectiveEndDate,
  });
  return result.next;
}

/** BR-08: kéo dài tới ngày mới (không trước hôm nay), có revision. */
export async function extendExperiment(id: string, newEndDate: ISODate, reason: string, expectedVersion: number) {
  if (!isISODate(newEndDate)) throw new DomainError('Ngày kết thúc mới không hợp lệ.');
  const result = await db.transaction('rw', db.experiments, db.revisions, async () => {
    const e = await getExperimentOrThrow(id);
    if (!isOpen(e)) throw new DomainError('Chỉ kéo dài được thử nghiệm chưa khép lại.');
    checkVersion(e, expectedVersion);
    const today = todayFor(e.timezone);
    if (newEndDate < today) throw new DomainError('Ngày kết thúc mới không được trước hôm nay.');
    if (newEndDate < e.startDate!) throw new DomainError('Ngày kết thúc mới phải sau ngày bắt đầu.');
    const currentEnd = e.effectiveEndDate ?? e.endDate!;
    if (newEndDate <= currentEnd && e.status === 'active') throw new DomainError('Ngày mới phải sau ngày kết thúc hiện tại.');
    const next: Experiment = {
      ...e,
      endDate: newEndDate,
      effectiveEndDate: null,
      status: 'active',
      version: e.version + 1,
      updatedAt: nowUTC(),
    };
    await db.experiments.put(next);
    const rev = await addRevision(e, next, 'extend', reason, today);
    return { next, rev };
  });
  notifyChange();
  await trackForExperiment('experiment_changed', id, { changeType: 'extend', revisionNumber: result.rev.number, effectiveEndDate: newEndDate });
  return result.next;
}

// ---------- Phản tư ----------

export interface ReflectionInput {
  plus: string;
  minus: string;
  next: string;
  clarity: Clarity | null;
  decision: Decision | null;
  rationale: string;
}

function cleanReflection(input: ReflectionInput) {
  return {
    plus: clip(input.plus, LIMITS.reflectionField, 'Điều có ích'),
    minus: clip(input.minus, LIMITS.reflectionField, 'Điều chưa phù hợp'),
    next: clip(input.next, LIMITS.reflectionField, 'Muốn thử tiếp'),
    rationale: clip(input.rationale, LIMITS.rationale, 'Căn cứ'),
    clarity: input.clarity,
    decision: input.decision,
  };
}

/** expectedVersion: version reflection đang có (0 nếu chưa có). */
export async function saveReflection(experimentId: string, input: ReflectionInput, expectedVersion: number, submit: boolean) {
  const clean = cleanReflection(input);
  if (submit) {
    if (!clean.decision) throw new DomainError('Hãy chọn bước tiếp theo: tiếp tục, điều chỉnh hoặc dừng.');
    const hasText = !!(clean.plus || clean.minus || clean.next);
    if (!hasText && clean.clarity !== 'unclear') {
      throw new DomainError('Viết ít nhất một dòng phản tư, hoặc chọn “Chưa rõ bài học” — cả hai đều hợp lệ.');
    }
  }
  let firstSubmit = false;
  const result = await db.transaction('rw', db.experiments, db.reflections, async () => {
    const e = await getExperimentOrThrow(experimentId);
    if (e.status === 'draft' || e.status === 'active') {
      throw new DomainError('Hãy dừng hoặc chờ thử nghiệm kết thúc trước khi phản tư.');
    }
    const existing = await db.reflections.where('experimentId').equals(experimentId).first();
    if ((existing?.version ?? 0) !== expectedVersion) throw new ConflictError();
    const ts = nowUTC();
    const wasSubmitted = existing?.status === 'submitted';
    const r: Reflection = {
      id: existing?.id ?? uuid(),
      experimentId,
      ...clean,
      status: submit || wasSubmitted ? 'submitted' : 'draft',
      firstSubmittedAt: existing?.firstSubmittedAt ?? (submit ? ts : null),
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    if (submit && !existing?.firstSubmittedAt) firstSubmit = true;
    await db.reflections.put(r);
    let exp = e;
    if (submit && e.status !== 'closed') {
      exp = { ...e, status: 'closed', version: e.version + 1, updatedAt: ts };
      await db.experiments.put(exp);
    }
    return { r, exp };
  });
  notifyChange();
  if (submit) {
    await trackForExperiment('reflection_submitted', experimentId, {
      decision: result.r.decision,
      clarity: result.r.clarity,
      hasReflectionText: !!(result.r.plus || result.r.minus || result.r.next),
      isFirstSubmit: firstSubmit,
    });
    if (firstSubmit) await trackForExperiment('experiment_closed', experimentId, { reason: 'reviewSubmitted' });
  }
  return result;
}

/** BR-13: tạo Draft mới liên kết parentId, không tự bắt đầu, không sao chép log. */
export async function createFollowUpDraft(parentId: string): Promise<Experiment> {
  const parent = await getExperimentOrThrow(parentId);
  if (parent.status !== 'closed') throw new DomainError('Hãy lưu phần nhìn lại trước khi tạo vòng tiếp theo.');
  const refl = await db.reflections.where('experimentId').equals(parentId).first();
  const child = await createDraft(
    {
      curiosity: parent.curiosity,
      action: refl?.decision === 'adjust' && refl.next ? refl.next.slice(0, LIMITS.action) : parent.action,
      startDate: null,
      endDate: null,
      weekdays: parent.weekdays,
    },
    parentId,
  );
  await trackPair(parentId, child.id);
  return child;
}

async function trackPair(parentId: string, childId: string) {
  const profile = await db.profile.get('local');
  if (!profile?.telemetryConsent) return;
  await track('followup_created', { parentKey: await keyFor(parentId), childKey: await keyFor(childId) });
}

// ---------- Xóa ----------

/** BR-19: xóa cascade; vòng con giữ lại với parentId = null. */
export async function deleteExperiment(id: string) {
  await db.transaction('rw', [db.experiments, db.revisions, db.checkins, db.reflections, db.eventKeys], async () => {
    await db.revisions.where('experimentId').equals(id).delete();
    await db.checkins.where('experimentId').equals(id).delete();
    await db.reflections.where('experimentId').equals(id).delete();
    await db.eventKeys.delete(id);
    await db.experiments.where('parentId').equals(id).modify({ parentId: null });
    await db.experiments.delete(id);
  });
  notifyChange();
}

export async function deleteAll() {
  await db.transaction('rw', [db.experiments, db.revisions, db.checkins, db.reflections, db.events, db.eventKeys, db.profile], async () => {
    await Promise.all([
      db.experiments.clear(),
      db.revisions.clear(),
      db.checkins.clear(),
      db.reflections.clear(),
      db.events.clear(),
      db.eventKeys.clear(),
      db.profile.clear(),
    ]);
  });
  await initializeProfile();
  notifyChange();
}

// ---------- Đọc ----------

export interface Snapshot {
  profile: Profile;
  experiments: Experiment[];
  revisions: Revision[];
  checkins: CheckIn[];
  reflections: Reflection[];
  eventCount: number;
}

export async function loadSnapshot(): Promise<Snapshot> {
  return db.transaction('r', [db.profile, db.experiments, db.revisions, db.checkins, db.reflections, db.events], async () => {
    const [profile, experiments, revisions, checkins, reflections, eventCount] = await Promise.all([
      db.profile.get('local'),
      db.experiments.toArray(),
      db.revisions.toArray(),
      db.checkins.toArray(),
      db.reflections.toArray(),
      db.events.count(),
    ]);
    if (!profile) throw new StorageUnavailableError('Thiếu hồ sơ cục bộ.');
    return { profile, experiments, revisions, checkins, reflections, eventCount };
  });
}

