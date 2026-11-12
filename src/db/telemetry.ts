import { APP_VERSION, db, nowUTC, uuid } from './db';
import type { PilotEvent } from '../domain/types';

/** EVT allowlist: chỉ metadata, không bao giờ chứa nội dung nhật ký. */
export type EventType =
  | 'onboarding_completed'
  | 'experiment_started'
  | 'checkin_saved'
  | 'experiment_changed'
  | 'reflection_submitted'
  | 'experiment_closed'
  | 'followup_created'
  | 'prompt_dismissed'
  | 'operation_failed'
  | 'backup_action';

type Payload = Record<string, string | number | boolean | null>;

const ALLOWED_KEYS: Record<EventType, string[]> = {
  onboarding_completed: ['mode'],
  experiment_started: ['experimentKey', 'startDate', 'endDate', 'scheduleType', 'timezone'],
  checkin_saved: ['experimentKey', 'logKey', 'occurrenceDate', 'outcome', 'hasObservation', 'isEdit', 'isLate'],
  experiment_changed: ['experimentKey', 'changeType', 'effectiveEndDate', 'revisionNumber'],
  reflection_submitted: ['experimentKey', 'decision', 'clarity', 'hasReflectionText', 'isFirstSubmit'],
  experiment_closed: ['experimentKey', 'reason'],
  followup_created: ['parentKey', 'childKey'],
  prompt_dismissed: ['promptType'],
  operation_failed: ['operationType', 'errorCode'],
  backup_action: ['action', 'schemaVersion', 'itemCountBucket'],
};

export const EVENT_RETENTION_DAYS = 30;

export async function keyFor(experimentId: string): Promise<string> {
  const existing = await db.eventKeys.get(experimentId);
  if (existing) return existing.key;
  const key = uuid();
  await db.eventKeys.put({ experimentId, key });
  return key;
}

/** Ghi event chỉ khi người dùng đã đồng ý. Gọi SAU khi transaction nghiệp vụ đã commit. */
export async function track(type: EventType, payload: Payload = {}): Promise<void> {
  try {
    const profile = await db.profile.get('local');
    if (!profile?.telemetryConsent) return;
    const clean: Payload = {};
    for (const k of ALLOWED_KEYS[type]) if (k in payload) clean[k] = payload[k];
    const ev: PilotEvent = {
      eventId: uuid(),
      eventType: type,
      eventSchemaVersion: 1,
      appVersion: APP_VERSION,
      installationId: profile.installationId,
      occurredAt: nowUTC(),
      payload: clean,
    };
    await db.events.add(ev);
  } catch {
    /* telemetry không được làm hỏng thao tác chính */
  }
}

export async function trackForExperiment(type: EventType, experimentId: string, payload: Payload = {}) {
  const profile = await db.profile.get('local').catch(() => undefined);
  if (!profile?.telemetryConsent) return;
  const experimentKey = await keyFor(experimentId);
  await track(type, { ...payload, experimentKey });
}

export async function pruneEvents() {
  const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86400000).toISOString();
  await db.events.where('occurredAt').below(cutoff).delete();
}

export async function exportEvents(): Promise<string> {
  const profile = await db.profile.get('local');
  const events = await db.events.orderBy('occurredAt').toArray();
  return JSON.stringify(
    {
      kind: 'tiny-experiments-pilot-events',
      note: 'File này chỉ chứa metadata sử dụng, không có nội dung nhật ký.',
      installationId: profile?.installationId,
      exportedAt: nowUTC(),
      events,
    },
    null,
    2,
  );
}

export function countBucket(n: number): string {
  if (n === 0) return '0';
  if (n <= 5) return '1-5';
  if (n <= 20) return '6-20';
  return '21+';
}
