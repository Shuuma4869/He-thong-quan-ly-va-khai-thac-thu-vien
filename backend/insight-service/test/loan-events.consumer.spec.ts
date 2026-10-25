import { LoanEventsConsumer } from '../src/notifications/loan-events.consumer';
import { NotificationRepository } from '../src/notifications/notification.repository';

const saved = { enabled: process.env.NOTIFICATIONS_ENABLED, brokers: process.env.KAFKA_BOOTSTRAP_SERVERS };
afterEach(() => {
  for (const [key, value] of Object.entries({ NOTIFICATIONS_ENABLED: saved.enabled, KAFKA_BOOTSTRAP_SERVERS: saved.brokers })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
test('mặc định tắt, khởi động/dừng không cần broker', async () => {
  delete process.env.NOTIFICATIONS_ENABLED;
  const consumer = new LoanEventsConsumer({} as NotificationRepository);
  await consumer.onApplicationBootstrap();
  expect(consumer.status()).toEqual({ enabled: false, connected: false });
  await consumer.onModuleDestroy();
});
test('không nhận giá trị cấu hình bật/tắt mơ hồ', async () => {
  process.env.NOTIFICATIONS_ENABLED = 'yes';
  await expect(new LoanEventsConsumer({} as NotificationRepository).onApplicationBootstrap()).rejects.toThrow('true hoặc false');
});
test.each(['', 'https://kafka:9092', 'user:password@host:9092', 'localhost:0', 'localhost:99999', 'localhost:9092,'])('từ chối broker sai: %s', async broker => {
  process.env.NOTIFICATIONS_ENABLED = 'true'; process.env.KAFKA_BOOTSTRAP_SERVERS = broker;
  await expect(new LoanEventsConsumer({} as NotificationRepository).onApplicationBootstrap()).rejects.toThrow('KAFKA_BOOTSTRAP_SERVERS');
});
