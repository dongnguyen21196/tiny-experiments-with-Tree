export type ISODate = string; // YYYY-MM-DD (ngày nghiệp vụ theo timezone của experiment)
export type UTCStamp = string; // ISO timestamp UTC

export type ExperimentStatus = 'draft' | 'active' | 'awaiting_reflection' | 'closed';
export type Outcome = 'tried' | 'not_done';
export type Clarity = 'some_learning' | 'unclear';
export type Decision = 'continue' | 'adjust' | 'stop';
export type ChangeType = 'baseline' | 'amend' | 'extend' | 'end_early';

export interface Profile {
  id: 'local';
  installationId: string;
  timezone: string;
  telemetryConsent: boolean;
  onboarded: boolean;
  dismissedPrompts: string[];
  createdAt: UTCStamp;
}

export interface Experiment {
  id: string;
  parentId: string | null;
  curiosity: string;
  action: string;
  startDate: ISODate | null;
  endDate: ISODate | null;
  effectiveEndDate: ISODate | null;
  weekdays: number[]; // ISO 1 (Thứ 2) … 7 (Chủ nhật)
  timezone: string;
  status: ExperimentStatus;
  version: number;
  createdAt: UTCStamp;
  updatedAt: UTCStamp;
}

export interface Commitment {
  action: string;
  weekdays: number[];
  endDate: ISODate;
  effectiveEndDate: ISODate | null;
}

export interface Revision {
  id: string;
  experimentId: string;
  number: number;
  changeType: ChangeType;
  effectiveDate: ISODate;
  before: Commitment | null;
  after: Commitment;
  reason: string | null;
  createdAt: UTCStamp;
}

export interface CheckIn {
  id: string;
  experimentId: string;
  occurrenceDate: ISODate;
  outcome: Outcome;
  observation: string;
  revisionId: string;
  editedAfterClose: boolean;
  version: number;
  createdAt: UTCStamp;
  updatedAt: UTCStamp;
}

export interface Reflection {
  id: string;
  experimentId: string;
  plus: string;
  minus: string;
  next: string;
  clarity: Clarity | null;
  decision: Decision | null;
  rationale: string;
  status: 'draft' | 'submitted';
  firstSubmittedAt: UTCStamp | null;
  version: number;
  createdAt: UTCStamp;
  updatedAt: UTCStamp;
}

export interface PilotEvent {
  eventId: string;
  eventType: string;
  eventSchemaVersion: number;
  appVersion: string;
  installationId: string;
  occurredAt: UTCStamp;
  payload: Record<string, string | number | boolean | null>;
}

export const LIMITS = {
  curiosity: 500,
  action: 500,
  observation: 3000,
  reflectionField: 3000,
  rationale: 1500,
  reason: 500,
} as const;
