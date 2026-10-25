import { randomUUID } from 'node:crypto';
import { InvalidCirculationEvent, loanTopic } from '../src/notifications/circulation-event';
import { EventSource, NotificationProcessor } from '../src/notifications/notification-processor';

function source(): EventSource {
  const id = randomUUID();
  return { topic: loanTopic, partition: 0, offset: '9007199254740993', key: id,
    value: Buffer.from(JSON.stringify({ eventId: randomUUID(), eventType: 'COPY_BORROWED', aggregateId: id, aggregateVersion: 0, version: 1,
      occurredAt: '2026-10-25T00:00:00Z', data: { loanId: id, readerId: randomUUID(), version: 0, dueAt: '2026-11-08T00:00:00Z', returnedAt: null } })) };
}
test('thành công và duplicate từ repository không gửi DLQ', async () => {
  const accept = jest.fn().mockResolvedValue('DUPLICATE'), dlq = jest.fn(), heartbeat = jest.fn().mockResolvedValue(undefined);
  await new NotificationProcessor(accept, dlq).process(source(), heartbeat);
  expect(accept).toHaveBeenCalledTimes(1); expect(dlq).not.toHaveBeenCalled();
});
test('lỗi tạm thời thử lại có heartbeat; hồi phục không gửi DLQ', async () => {
  const accept = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue('APPLIED');
  const dlq = jest.fn(), wait = jest.fn().mockResolvedValue(undefined), heartbeat = jest.fn().mockResolvedValue(undefined);
  await new NotificationProcessor(accept, dlq, wait).process(source(), heartbeat);
  expect(accept).toHaveBeenCalledTimes(2); expect(wait).toHaveBeenCalledWith(250); expect(dlq).not.toHaveBeenCalled();
});
test('sau năm lần lỗi storage chỉ chuyển DLQ bản chuẩn hóa, không log lỗi/secret', async () => {
  const accept = jest.fn().mockRejectedValue(new Error('password-do-not-leak')), dlq = jest.fn().mockResolvedValue(undefined);
  const wait = jest.fn().mockResolvedValue(undefined);
  await new NotificationProcessor(accept, dlq, wait).process(source(), async () => {});
  expect(accept).toHaveBeenCalledTimes(5); expect(wait.mock.calls.map(c => c[0])).toEqual([250, 500, 1000, 2000]);
  expect(dlq.mock.calls[0][0]).toMatchObject({ reason: 'STORAGE_UNAVAILABLE', source: { offset: '9007199254740993' } });
  expect(JSON.stringify(dlq.mock.calls)).not.toContain('password-do-not-leak');
});
test('envelope sai không ghi DB và DLQ không chứa raw payload', async () => {
  const accept = jest.fn(), dlq = jest.fn().mockResolvedValue(undefined);
  await new NotificationProcessor(accept, dlq).process({ ...source(), value: Buffer.from('{"secret":"do-not-copy"}') }, async () => {});
  expect(accept).not.toHaveBeenCalled(); expect(dlq.mock.calls[0][0].event).toBeNull();
  expect(JSON.stringify(dlq.mock.calls)).not.toContain('do-not-copy');
});
test('xung đột eventId/version đi DLQ ngay; DLQ không ACK phải ném lỗi để giữ offset', async () => {
  const accept = jest.fn().mockRejectedValue(new InvalidCirculationEvent('EVENT_ID_REUSED'));
  const dlq = jest.fn().mockRejectedValue(new Error('broker down'));
  await expect(new NotificationProcessor(accept, dlq).process(source(), async () => {})).rejects.toThrow('broker down');
  expect(accept).toHaveBeenCalledTimes(1); expect(dlq.mock.calls[0][0].reason).toBe('EVENT_ID_REUSED');
});
