import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Kafka, logLevel } = require('kafkajs');

const broker = process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:19092';
const suffix = `${Date.now()}-${process.pid}`;
const topic = `lams.smoke.host.${suffix}`;
const expected = `lams-host-${suffix}`;
const kafka = new Kafka({ clientId: 'lams-smoke-host', brokers: [broker], logLevel: logLevel.NOTHING });
const admin = kafka.admin();
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: `lams-smoke-${suffix}` });

try {
  await admin.connect();
  await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });

  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Hết thời gian chờ message Kafka.')), 15_000);
    consumer
      .run({
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (value === expected) {
            clearTimeout(timeout);
            resolve(value);
          }
        },
      })
      .catch(reject);
  });

  await producer.send({ topic, messages: [{ value: expected }] });
  await received;
  console.log(`[OK] Kafka external ${broker}: produce/consume thành công.`);
} finally {
  await consumer.disconnect().catch(() => undefined);
  await producer.disconnect().catch(() => undefined);
  await admin.deleteTopics({ topics: [topic] }).catch(() => undefined);
  await admin.disconnect().catch(() => undefined);
}
