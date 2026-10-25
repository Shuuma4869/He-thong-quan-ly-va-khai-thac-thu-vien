import { randomUUID } from 'node:crypto';
import { eventDigest, eventTypes, holdTopic, loanTopic, parseCirculationEvent } from '../src/notifications/circulation-event';

const aggregateId = randomUUID(), readerId = randomUUID();
const time = '2026-10-25T00:00:00.123456Z';
function loan() { return { eventId: randomUUID(), eventType: 'COPY_BORROWED', aggregateId, aggregateVersion: 0, version: 1,
  occurredAt: time, data: { loanId: aggregateId, version: 0, readerId, dueAt: time, returnedAt: null } }; }
function parse(value: unknown, topic = loanTopic, key = aggregateId) { return parseCirculationEvent(topic, key, Buffer.from(JSON.stringify(value))); }
test.each(eventTypes)('%s được chuẩn hóa và không giữ trường danh tính thừa', type => {
  const source = loan(); source.eventType = type;
  const isHold = type.startsWith('HOLD_');
  const states: Record<string,string> = { HOLD_CREATED: 'WAITING', HOLD_READY: 'READY', HOLD_EXPIRED: 'EXPIRED', HOLD_CANCELLED: 'CANCELLED', HOLD_FULFILLED: 'FULFILLED' };
  const data = isHold ? { id: aggregateId, version: 0, readerId, status: states[type], expiresAt: time } : { ...source.data, returnedAt: type === 'COPY_RETURNED' ? time : null };
  const result = parse({ ...source, data: { ...data, email: 'must-not-store@test.local', fullName: 'Không lưu' } }, isHold ? holdTopic : loanTopic);
  expect(result).toMatchObject({ eventType: type, readerId, aggregateId, occurredAt: '2026-10-25T00:00:00.123Z' });
  expect(result).not.toHaveProperty('email'); expect(result).not.toHaveProperty('data');
  expect(eventDigest(result)).toMatch(/^[a-f0-9]{64}$/);
});
test.each([
  { version: 2 }, { version: 4294967297 }, { eventType: 'UNKNOWN' }, { aggregateVersion: -1 },
  { aggregateVersion: Number.MAX_SAFE_INTEGER + 1 }, { eventId: 'bad' }, { occurredAt: '2026-02-31T00:00:00Z' },
  { data: {} }, { data: { ...loan().data, version: 1 } }, { data: { ...loan().data, returnedAt: time } },
])('từ chối envelope sai: %j', patch => { expect(() => parse({ ...loan(), ...patch })).toThrow(); });
test('từ chối topic/key sai, JSON lỗi và payload quá lớn', () => {
  expect(() => parse(loan(), holdTopic)).toThrow('WRONG_TOPIC');
  expect(() => parse(loan(), loanTopic, randomUUID())).toThrow('WRONG_KEY');
  expect(() => parseCirculationEvent(loanTopic, aggregateId, Buffer.from('{'))).toThrow('INVALID_JSON');
  expect(() => parseCirculationEvent(loanTopic, aggregateId, Buffer.alloc(65537))).toThrow('INVALID_SIZE');
  expect(() => parseCirculationEvent(loanTopic, aggregateId, null)).toThrow('INVALID_SIZE');
});
