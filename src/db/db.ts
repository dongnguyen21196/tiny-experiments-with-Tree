import Dexie, { type Table } from 'dexie';
import type { CheckIn, Experiment, PilotEvent, Profile, Reflection, Revision } from '../domain/types';

export const DB_NAME = 'tiny-experiments';
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.1.0';

export interface EventKey {
  experimentId: string;
  key: string;
}

export class TinyDB extends Dexie {
  profile!: Table<Profile, string>;
  experiments!: Table<Experiment, string>;
  revisions!: Table<Revision, string>;
  checkins!: Table<CheckIn, string>;
  reflections!: Table<Reflection, string>;
  events!: Table<PilotEvent, string>;
  eventKeys!: Table<EventKey, string>;

  constructor(name = DB_NAME) {
    super(name);
    // Mỗi thay đổi schema sau này: thêm this.version(n).stores(...).upgrade(...) — không xóa DB.
    this.version(SCHEMA_VERSION).stores({
      profile: 'id',
      experiments: 'id, status, parentId, updatedAt',
      revisions: 'id, experimentId, [experimentId+number]',
      checkins: 'id, experimentId, &[experimentId+occurrenceDate]',
      reflections: 'id, &experimentId',
      events: 'eventId, occurredAt',
      eventKeys: 'experimentId',
    });
  }
}

export let db = new TinyDB();

export function setDatabase(next: TinyDB) {
  db = next;
}

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export const nowUTC = () => new Date().toISOString();
