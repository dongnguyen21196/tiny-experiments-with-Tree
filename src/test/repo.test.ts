import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TinyDB, db, setDatabase } from '../db/db';
import * as repo from '../db/repo';
import { setClock } from '../domain/clock';
import { buildTimeline } from '../domain/rules';
import { ConflictError, DomainError } from '../domain/rules';
import { parseBackup, replaceImport, exportBackupJSON } from '../db/backup';
import { setTelemetryConsent } from '../db/repo';

const TZ = 'Asia/Ho_Chi_Minh';
// 12:00 giờ Việt Nam của một ngày
const at = (date: string) => () => new Date(`${date}T05:00:00Z`);
let n = 0;

beforeEach(async () => {
  setDatabase(new TinyDB(`test-${++n}`));
  setClock(at('2026-11-12'));
  await repo.initializeProfile();
  await db.profile.update('local', { timezone: TZ });
});
afterEach(() => {
  setClock(null);
  db.close();
});

async function started(weekdays = [1, 2, 3, 4, 5, 6, 7], start = '2026-11-12', end = '2026-11-18') {
  const d = await repo.createDraft({ curiosity: 'Tắt thông báo có giúp tập trung? 🙂', action: 'Tắt chat 9h–10h', startDate: start, endDate: end, weekdays });
  return repo.startExperiment(d.id, d.version);
}

describe('start (BR-01, BR-02, TC-02, TC-03)', () => {
  it('rejects incomplete drafts and keeps them', async () => {
    const d = await repo.createDraft({ curiosity: 'abc', action: '', startDate: null, endDate: null, weekdays: [] });
    await expect(repo.startExperiment(d.id, d.version)).rejects.toBeInstanceOf(DomainError);
    expect((await db.experiments.get(d.id))!.status).toBe('draft');
  });
  it('starts once even with double submit and creates baseline revision', async () => {
    const d = await repo.createDraft({ curiosity: 'a', action: 'b', startDate: '2026-11-12', endDate: '2026-11-20', weekdays: [1, 3] });
    const results = await Promise.allSettled([repo.startExperiment(d.id, d.version), repo.startExperiment(d.id, d.version)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.revisions.count()).toBe(1);
  });
  it('rejects start date in the past (BR-24)', async () => {
    const d = await repo.createDraft({ curiosity: 'a', action: 'b', startDate: '2026-11-10', endDate: '2026-11-20', weekdays: [1] });
    await expect(repo.startExperiment(d.id, d.version)).rejects.toThrow(/trước hôm nay/);
  });
  it('allows only one open experiment', async () => {
    await started();
    const d = await repo.createDraft({ curiosity: 'x', action: 'y', startDate: '2026-11-12', endDate: '2026-11-13', weekdays: [1, 2, 3, 4, 5, 6, 7] });
    await expect(repo.startExperiment(d.id, d.version)).rejects.toThrow(/chưa khép lại/);
  });
  it('rejects a range with no matching weekday', async () => {
    // 12/11/2026 là Thứ Năm; 13 là Thứ Sáu → không có Thứ Hai
    const d = await repo.createDraft({ curiosity: 'x', action: 'y', startDate: '2026-11-12', endDate: '2026-11-13', weekdays: [1] });
    await expect(repo.startExperiment(d.id, d.version)).rejects.toThrow(/không có ngày nào/);
  });
});

describe('check-ins (BR-03..05, TC-04, TC-06)', () => {
  it('no log stays "not logged"', async () => {
    const e = await started();
    setClock(at('2026-11-14'));
    const revs = await db.revisions.toArray();
    const tl = buildTimeline((await db.experiments.get(e.id))!, revs, [], '2026-11-14');
    expect(tl.find((r) => r.date === '2026-11-12')!.state).toBe('not_logged');
  });
  it('late log keeps occurrence date, one per day, edit needs version', async () => {
    const e = await started();
    setClock(at('2026-11-14'));
    const c = await repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-13', outcome: 'tried', observation: 'ổn' });
    expect(c.occurrenceDate).toBe('2026-11-13');
    await expect(
      repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-13', outcome: 'not_done', observation: '' }),
    ).rejects.toBeInstanceOf(ConflictError);
    const edited = await repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-13', outcome: 'not_done', observation: 'sửa', expectedVersion: c.version });
    expect(edited.version).toBe(2);
    // tab cũ dùng version cũ → conflict (TC-17)
    await expect(
      repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-13', outcome: 'tried', observation: 'tab B', expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await db.checkins.count()).toBe(1);
  });
  it('rejects future and pre-start dates', async () => {
    const e = await started();
    await expect(repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-13', outcome: 'tried', observation: '' })).rejects.toThrow(/tương lai/);
    await expect(repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-11', outcome: 'tried', observation: '' })).rejects.toThrow(/trước khi/);
  });
});

describe('lifecycle (TC-08..TC-13)', () => {
  it('end early → awaiting reflection, no reason needed', async () => {
    const e = await started();
    const s = await repo.endEarly(e.id, '', e.version);
    expect(s.status).toBe('awaiting_reflection');
    expect(s.effectiveEndDate).toBe('2026-11-12');
  });
  it('after endDate becomes awaiting reflection, never auto-closed', async () => {
    const e = await started();
    setClock(at('2026-11-19'));
    await repo.refreshStatuses();
    expect((await db.experiments.get(e.id))!.status).toBe('awaiting_reflection');
  });
  it('extend after expiry returns to active with revision; old logs unchanged', async () => {
    const e = await started();
    await repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-12', outcome: 'tried', observation: 'x' });
    setClock(at('2026-11-19'));
    await repo.refreshStatuses();
    const cur = (await db.experiments.get(e.id))!;
    const ext = await repo.extendExperiment(e.id, '2026-11-25', 'thiếu thời gian', cur.version);
    expect(ext.status).toBe('active');
    expect(await db.revisions.count()).toBe(2);
    expect((await db.checkins.toArray())[0].occurrenceDate).toBe('2026-11-12');
  });
  it('amend keeps old logs on old revision (TC-10)', async () => {
    const e = await started();
    const c1 = await repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-12', outcome: 'tried', observation: '' });
    setClock(at('2026-11-13'));
    const cur = (await db.experiments.get(e.id))!;
    await repo.amendCommitment(e.id, { action: 'Tắt chat 8h–9h', weekdays: [1, 2, 3, 4, 5] }, '', cur.version);
    const c2 = await repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-13', outcome: 'tried', observation: '' });
    expect(c1.revisionId).not.toBe(c2.revisionId);
    const r1 = (await db.revisions.get(c1.revisionId))!;
    expect(r1.after.action).toBe('Tắt chat 9h–10h');
  });
  it('stale version is rejected (BR-22)', async () => {
    const e = await started();
    await repo.endEarly(e.id, '', e.version);
    await expect(repo.extendExperiment(e.id, '2026-11-20', '', e.version)).rejects.toBeInstanceOf(ConflictError);
  });
  it('unclear + stop closes; follow-up is a linked draft; edits do not reset firstSubmittedAt', async () => {
    const e = await started();
    const s = await repo.endEarly(e.id, '', e.version);
    const empty = { plus: '', minus: '', next: '', rationale: '', clarity: null, decision: 'stop' as const };
    await expect(repo.saveReflection(s.id, empty, 0, true)).rejects.toThrow(/Chưa rõ/);
    const { r } = await repo.saveReflection(s.id, { ...empty, clarity: 'unclear', decision: 'continue' }, 0, true);
    expect((await db.experiments.get(e.id))!.status).toBe('closed');
    const child = await repo.createFollowUpDraft(e.id);
    expect(child.parentId).toBe(e.id);
    expect(child.status).toBe('draft');
    const { r: r2 } = await repo.saveReflection(s.id, { ...empty, plus: 'thêm', clarity: 'unclear', decision: 'continue' }, r.version, true);
    expect(r2.firstSubmittedAt).toBe(r.firstSubmittedAt);
    expect(r2.version).toBe(2);
  });
});

describe('delete (BR-19, TC-16)', () => {
  it('cascades and unlinks children', async () => {
    const e = await started();
    await repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-12', outcome: 'tried', observation: '' });
    const s = await repo.endEarly(e.id, '', e.version);
    await repo.saveReflection(s.id, { plus: 'a', minus: '', next: '', rationale: '', clarity: null, decision: 'continue' }, 0, true);
    const child = await repo.createFollowUpDraft(e.id);
    await repo.deleteExperiment(e.id);
    expect(await db.checkins.count()).toBe(0);
    expect(await db.revisions.count()).toBe(0);
    expect(await db.reflections.count()).toBe(0);
    expect((await db.experiments.get(child.id))!.parentId).toBeNull();
  });
  it('deleteAll clears everything including events', async () => {
    await setTelemetryConsent(true, false);
    await started();
    expect(await db.events.count()).toBeGreaterThan(0);
    await repo.deleteAll();
    expect(await db.experiments.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
    expect((await db.profile.get('local'))!.telemetryConsent).toBe(false);
  });
});

describe('telemetry (TC-18)', () => {
  it('records nothing without consent and never includes diary text', async () => {
    const e = await started();
    await repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-12', outcome: 'tried', observation: 'BÍ MẬT' });
    expect(await db.events.count()).toBe(0);
    await setTelemetryConsent(true, false);
    const s = await repo.endEarly(e.id, 'lý do riêng', (await db.experiments.get(e.id))!.version);
    await repo.saveReflection(s.id, { plus: 'BÍ MẬT', minus: '', next: '', rationale: '', clarity: null, decision: 'stop' }, 0, true);
    const all = JSON.stringify(await db.events.toArray());
    expect(all).not.toContain('BÍ MẬT');
    expect(all).not.toContain('lý do riêng');
    expect(all).not.toContain('Tắt chat');
    expect(all).not.toContain(e.id);
  });
});

describe('backup (TC-14, TC-15, TC-21)', () => {
  it('round-trips data with Vietnamese/emoji and no telemetry', async () => {
    await setTelemetryConsent(true, false);
    const e = await started();
    await repo.upsertCheckIn({ experimentId: e.id, occurrenceDate: '2026-11-12', outcome: 'tried', observation: '<script>alert(1)</script> Tiếng Việt 🌱' });
    const json = await exportBackupJSON();
    expect(json).not.toContain('installationId');
    const before = await repo.loadSnapshot();

    setDatabase(new TinyDB(`test-${++n}`));
    await repo.initializeProfile();
    const p = parseBackup(json, json.length);
    await replaceImport(p);
    const after = await repo.loadSnapshot();
    expect(after.experiments).toEqual(before.experiments);
    expect(after.checkins).toEqual(before.checkins);
    expect(after.revisions).toEqual(before.revisions);
    expect(after.profile.telemetryConsent).toBe(false);
    expect(after.eventCount).toBe(0);
  });
  it('rejects bad files and leaves data untouched', async () => {
    const e = await started();
    const good = JSON.parse(await exportBackupJSON());
    expect(() => parseBackup('not json', 8)).toThrow(/JSON/);
    expect(() => parseBackup('{}', 2)).toThrow(/không phải file sao lưu/);
    expect(() => parseBackup('{}', 6 * 1024 * 1024)).toThrow(/5 MB/);
    const newer = { ...good, schemaVersion: 99 };
    expect(() => parseBackup(JSON.stringify(newer), 100)).toThrow(/mới hơn/);
    const orphan = structuredClone(good);
    orphan.data.checkins.push({ ...orphan.data.revisions[0], id: 'aaaaaaaa-0000', experimentId: 'missing-0000-id', occurrenceDate: '2026-11-12', outcome: 'tried', observation: '', revisionId: orphan.data.revisions[0].id, editedAfterClose: false, version: 1, updatedAt: orphan.data.revisions[0].createdAt });
    expect(() => parseBackup(JSON.stringify(orphan), 100)).toThrow();
    const cyc = structuredClone(good);
    cyc.data.experiments[0].parentId = cyc.data.experiments[0].id;
    expect(() => parseBackup(JSON.stringify(cyc), 100)).toThrow(/lặp/);
    expect(await db.experiments.get(e.id)).toBeTruthy();
  });
});
