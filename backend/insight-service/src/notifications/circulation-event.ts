import { createHash } from 'node:crypto';

export class InvalidCirculationEvent extends Error {
  constructor(readonly code: string) { super(code); }
}
export const loanTopic = 'lams.circulation.events.v1';
export const holdTopic = 'lams.hold.events.v1';
export const eventTypes = ['COPY_BORROWED', 'COPY_RETURNED', 'LOAN_RENEWED', 'HOLD_CREATED', 'HOLD_READY', 'HOLD_EXPIRED', 'HOLD_CANCELLED', 'HOLD_FULFILLED'] as const;
export type CirculationEventType = typeof eventTypes[number];
export interface CirculationEvent {
  eventId: string; eventType: CirculationEventType; aggregateType: 'LOAN' | 'HOLD'; aggregateId: string;
  aggregateVersion: number; occurredAt: string; readerId: string; dueAt: string | null; expiresAt: string | null;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidCirculationEvent('INVALID_OBJECT');
  return value as Record<string, unknown>;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) throw new InvalidCirculationEvent('INVALID_UUID');
  return value.toLowerCase();
}
function instant(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value)) throw new InvalidCirculationEvent('INVALID_TIME');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(value.slice(0, 19))) throw new InvalidCirculationEvent('INVALID_TIME');
  return date.toISOString();
}
export function parseCirculationEvent(topic: string, key: string | null, raw: Buffer | null): CirculationEvent {
  if (!raw || raw.length > 65536) throw new InvalidCirculationEvent('INVALID_SIZE');
  let envelope: Record<string, unknown>;
  try { envelope = object(JSON.parse(raw.toString('utf8'))); }
  catch { throw new InvalidCirculationEvent('INVALID_JSON'); }
  if (envelope.version !== 1) throw new InvalidCirculationEvent('UNSUPPORTED_VERSION');
  if (!Number.isSafeInteger(envelope.aggregateVersion) || (envelope.aggregateVersion as number) < 0) throw new InvalidCirculationEvent('INVALID_AGGREGATE_VERSION');
  if (!eventTypes.includes(envelope.eventType as CirculationEventType)) throw new InvalidCirculationEvent('UNKNOWN_EVENT');
  const eventType = envelope.eventType as CirculationEventType;
  const aggregateType = eventType.startsWith('HOLD_') ? 'HOLD' : 'LOAN';
  if (topic !== (aggregateType === 'LOAN' ? loanTopic : holdTopic)) throw new InvalidCirculationEvent('WRONG_TOPIC');
  const aggregateId = uuid(envelope.aggregateId);
  if (key !== aggregateId) throw new InvalidCirculationEvent('WRONG_KEY');
  const data = object(envelope.data);
  if (uuid(aggregateType === 'LOAN' ? data.loanId : data.id) !== aggregateId || data.version !== envelope.aggregateVersion)
    throw new InvalidCirculationEvent('AGGREGATE_MISMATCH');
  let dueAt: string | null = null, expiresAt: string | null = null;
  if (aggregateType === 'LOAN') {
    dueAt = instant(data.dueAt);
    if (eventType === 'COPY_RETURNED') instant(data.returnedAt);
    else if (data.returnedAt !== null) throw new InvalidCirculationEvent('LOAN_STATE_MISMATCH');
  } else {
    const statuses: Record<string, string> = { HOLD_CREATED: 'WAITING', HOLD_READY: 'READY', HOLD_EXPIRED: 'EXPIRED', HOLD_CANCELLED: 'CANCELLED', HOLD_FULFILLED: 'FULFILLED' };
    if (data.status !== statuses[eventType]) throw new InvalidCirculationEvent('HOLD_STATE_MISMATCH');
    if (eventType === 'HOLD_READY') expiresAt = instant(data.expiresAt);
  }
  return { eventId: uuid(envelope.eventId), eventType, aggregateType, aggregateId,
    aggregateVersion: envelope.aggregateVersion as number, occurredAt: instant(envelope.occurredAt),
    readerId: uuid(data.readerId), dueAt, expiresAt };
}
export function eventDigest(event: CirculationEvent): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}
