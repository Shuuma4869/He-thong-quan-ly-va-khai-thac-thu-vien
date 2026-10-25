import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Consumer, Kafka, logLevel, Producer } from 'kafkajs';
import { holdTopic, loanTopic } from './circulation-event';
import { NotificationRepository } from './notification.repository';
import { NotificationProcessor } from './notification-processor';

export const notificationDlq = 'lams.notifications.dlq.v1';
@Injectable()
export class LoanEventsConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(LoanEventsConsumer.name);
  private consumer?: Consumer;
  private producer?: Producer;
  private connected = false;
  private closing = false;
  constructor(private readonly repository: NotificationRepository) {}
  status() { return { enabled: process.env.NOTIFICATIONS_ENABLED === 'true', connected: this.connected }; }
  async onApplicationBootstrap() {
    const enabled = process.env.NOTIFICATIONS_ENABLED ?? 'false';
    if (!['true', 'false'].includes(enabled)) throw new Error('NOTIFICATIONS_ENABLED phải là true hoặc false.');
    if (enabled !== 'true') return;
    const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:19092').split(',').map(v => v.trim());
    if (brokers.some(v => !/^[\w.-]+:\d{1,5}$/.test(v) || Number(v.split(':')[1]) < 1 || Number(v.split(':')[1]) > 65535))
      throw new Error('KAFKA_BOOTSTRAP_SERVERS không hợp lệ.');
    const kafka = new Kafka({ clientId: 'lams-insight-notifications', brokers, logLevel: logLevel.NOTHING,
      connectionTimeout: 3000, requestTimeout: 10000, retry: { retries: 5, initialRetryTime: 300, maxRetryTime: 5000 } });
    this.producer = kafka.producer({ allowAutoTopicCreation: false, idempotent: true, maxInFlightRequests: 1 });
    this.consumer = kafka.consumer({ groupId: process.env.NOTIFICATIONS_GROUP_ID ?? 'lams-insight-notifications-v1',
      allowAutoTopicCreation: false, sessionTimeout: 30000, heartbeatInterval: 3000,
      retry: { restartOnFailure: async () => !this.closing } });
    this.consumer.on(this.consumer.events.GROUP_JOIN, () => { if (!this.closing) this.connected = true; });
    this.consumer.on(this.consumer.events.CRASH, () => { this.connected = false; this.log.warn('Consumer bị gián đoạn; đang chờ kết nối lại.'); });
    this.consumer.on(this.consumer.events.DISCONNECT, () => { this.connected = false; });
    const processor = new NotificationProcessor(event => this.repository.accept(event), async record => {
      await this.producer!.send({ topic: notificationDlq, acks: -1,
        messages: [{ key: `${record.source.topic}:${record.source.partition}:${record.source.offset}`, value: JSON.stringify(record) }] });
      this.log.warn(`Sự kiện chuyển DLQ: ${record.reason}; nguồn ${record.source.topic}/${record.source.partition}/${record.source.offset}.`);
    });
    try {
      await this.producer.connect(); await this.consumer.connect();
      await this.consumer.subscribe({ topics: [loanTopic, holdTopic], fromBeginning: true });
      await this.consumer.run({ autoCommit: false, eachBatchAutoResolve: false, eachBatch: async ({ batch, heartbeat, isRunning, isStale, resolveOffset }) => {
        for (const message of batch.messages) {
          if (!isRunning() || isStale()) break;
          await processor.process({ topic: batch.topic, partition: batch.partition, offset: message.offset,
            key: message.key?.toString('utf8') ?? null, value: message.value }, heartbeat);
          if (!isRunning() || isStale()) break;
          // Chỉ commit offset sau transaction Insight hoặc ACK của DLQ. Crash giữa hai bước có thể giao lặp.
          await this.consumer!.commitOffsets([{ topic: batch.topic, partition: batch.partition, offset: (BigInt(message.offset) + 1n).toString() }]);
          resolveOffset(message.offset); await heartbeat();
        }
      } });
    } catch {
      await this.onModuleDestroy();
      throw new Error('Không khởi động được consumer thông báo. Kiểm tra broker, topic và quyền kết nối.');
    }
  }
  async onModuleDestroy() {
    this.closing = true;
    this.connected = false;
    try { if (this.consumer) await this.consumer.disconnect(); }
    finally { if (this.producer) await this.producer.disconnect(); }
  }
}
