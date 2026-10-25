import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { Kafka, logLevel, Producer, Consumer } from 'kafkajs';
import { PrismaService } from '../src/discovery/metadata/history/prisma.service';
import { NotificationRepository } from '../src/notifications/notification.repository';
import { CirculationEvent } from '../src/notifications/circulation-event';
import { LoanEventsConsumer, notificationDlq } from '../src/notifications/loan-events.consumer';

const container = `lams-notifications-test-${randomUUID()}`;
const password = randomUUID();
const previous = process.env.INSIGHT_DATABASE_URL;
let created = false;
let db: PrismaService;
let repository: NotificationRepository;
let kafkaCreated = false;
const kafkaContainer = `${container}-kafka`;
let events: LoanEventsConsumer | undefined, producer: Producer | undefined, dlq: Consumer | undefined;
const saved = { enabled: process.env.NOTIFICATIONS_ENABLED, brokers: process.env.KAFKA_BOOTSTRAP_SERVERS, group: process.env.NOTIFICATIONS_GROUP_ID };
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
beforeAll(async () => {
  docker('run', '-d', '--name', container, '--label', `lams.test=${container}`, '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', 'POSTGRES_DB=lams_insight_test', '-p', '127.0.0.1::5432', 'postgres:17.6-alpine');
  created = true;
  const port = /^127\.0\.0\.1:(\d+)$/.exec(docker('port', container, '5432/tcp'))?.[1];
  if (!port) throw new Error('Database test phải nằm trên loopback');
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { docker('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'lams_insight_test'); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error('PostgreSQL test chưa sẵn sàng');
  process.env.INSIGHT_DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/lams_insight_test`;
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'pipe', env: process.env });
  db = new PrismaService(); await db.onModuleInit(); repository = new NotificationRepository(db);
}, 90000);
afterAll(async () => {
  if (events) await events.onModuleDestroy();
  if (dlq) await dlq.disconnect();
  if (producer) await producer.disconnect();
  if (db) await db.onApplicationShutdown();
  if (kafkaCreated && docker('inspect', '--format', '{{index .Config.Labels "lams.test"}}', kafkaContainer) === kafkaContainer) docker('rm', '-f', '-v', kafkaContainer);
  if (created && docker('inspect', '--format', '{{index .Config.Labels "lams.test"}}', container) === container) docker('rm', '-f', '-v', container);
  if (previous === undefined) delete process.env.INSIGHT_DATABASE_URL; else process.env.INSIGHT_DATABASE_URL = previous;
  for (const [key, value] of Object.entries({ NOTIFICATIONS_ENABLED: saved.enabled, KAFKA_BOOTSTRAP_SERVERS: saved.brokers, NOTIFICATIONS_GROUP_ID: saved.group })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}, 30000);
function fact(): CirculationEvent { return { eventId: randomUUID(), eventType: 'HOLD_READY', aggregateId: randomUUID(), aggregateType: 'HOLD',
  aggregateVersion: 1, occurredAt: '2026-10-25T00:00:00.000Z', readerId: randomUUID(), dueAt: null, expiresAt: '2026-10-27T00:00:00.000Z' }; }
function where(event: CirculationEvent) { return { aggregateType_aggregateId: { aggregateType: event.aggregateType, aggregateId: event.aggregateId } }; }
test('receipt và thông báo bền vững qua kết nối mới, event lặp không nhân đôi', async () => {
  const event = fact(); expect(await repository.accept(event)).toBe('APPLIED');
  await db.$disconnect(); await db.$connect(); repository = new NotificationRepository(db);
  expect(await repository.accept(event)).toBe('DUPLICATE');
  expect(await db.circulationNotice.count({ where: { eventId: event.eventId } })).toBe(1);
  expect(await db.consumedCirculationEvent.count({ where: { eventId: event.eventId } })).toBe(1);
});
test('sự kiện cũ không thay trạng thái kết thúc bằng lời nhắc đến nhận', async () => {
  const ready = fact(); const ended: CirculationEvent = { ...ready, eventId: randomUUID(), eventType: 'HOLD_EXPIRED', aggregateVersion: 2, expiresAt: null };
  expect(await repository.accept(ended)).toBe('APPLIED'); expect(await repository.accept(ready)).toBe('OLDER');
  expect(await db.circulationNotice.findUnique({ where: where(ready) })).toMatchObject({ eventType: 'HOLD_EXPIRED', expiresAt: null, aggregateVersion: 2n });
  expect(await repository.accept(ready)).toBe('DUPLICATE');
});
test('consumer cạnh tranh giữ một trạng thái mới nhất và một receipt mỗi eventId', async () => {
  const original = fact();
  const events = [original, original, { ...original, eventId: randomUUID(), aggregateVersion: 2 }, { ...original, eventId: randomUUID(), aggregateVersion: 3 }];
  await Promise.all(events.map(event => repository.accept(event)));
  expect(await db.circulationNotice.findUnique({ where: where(original) })).toMatchObject({ aggregateVersion: 3n });
  expect(await db.consumedCirculationEvent.count({ where: { eventId: { in: events.map(e => e.eventId) } } })).toBe(3);
});
test('tái sử dụng eventId/version hoặc đổi reader bị từ chối, không ghi receipt sai', async () => {
  const original = fact(); await repository.accept(original);
  await expect(repository.accept({ ...original, aggregateVersion: 2 })).rejects.toThrow('EVENT_ID_REUSED');
  const wrongVersion = { ...original, eventId: randomUUID() };
  await expect(repository.accept(wrongVersion)).rejects.toThrow('VERSION_REUSED');
  const wrongReader = { ...original, eventId: randomUUID(), readerId: randomUUID(), aggregateVersion: 2 };
  await expect(repository.accept(wrongReader)).rejects.toThrow('READER_CHANGED');
  expect(await db.consumedCirculationEvent.count({ where: { eventId: { in: [wrongVersion.eventId, wrongReader.eventId] } } })).toBe(0);
});
test('lỗi ghi thông báo rollback cả receipt, retry vẫn xử lý được', async () => {
  const event = fact();
  await db.$executeRawUnsafe("CREATE FUNCTION reject_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only failure'; END $$");
  await db.$executeRawUnsafe('CREATE TRIGGER fail_notice BEFORE INSERT ON circulation_notices FOR EACH ROW EXECUTE FUNCTION reject_notice()');
  try {
    await expect(repository.accept(event)).rejects.toThrow();
    expect(await db.consumedCirculationEvent.findUnique({ where: { eventId: event.eventId } })).toBeNull();
  } finally { await db.$executeRawUnsafe('DROP TRIGGER fail_notice ON circulation_notices'); await db.$executeRawUnsafe('DROP FUNCTION reject_notice()'); }
  expect(await repository.accept(event)).toBe('APPLIED');
});
test('hai aggregate dùng cùng eventId không thể tạo hai thông báo', async () => {
  const first = fact(), second = { ...first, aggregateId: randomUUID() };
  const results = await Promise.allSettled([repository.accept(first), repository.accept(second)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  expect(await db.circulationNotice.count({ where: { eventId: first.eventId } })).toBe(1);
  expect(await db.consumedCirculationEvent.count({ where: { eventId: first.eventId } })).toBe(1);
});
test('khóa kéo dài bị giới hạn tại PostgreSQL, không lưu receipt rồi bỏ dở thông báo', async () => {
  const event = fact();
  let acquired!: () => void, release!: () => void;
  const locked = new Promise<void>(resolve => { acquired = resolve; });
  const done = new Promise<void>(resolve => { release = resolve; });
  const blocker = db.$transaction(async tx => {
    const key = `${event.aggregateType}:${event.aggregateId}`;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    acquired(); await done;
  }, { timeout: 10000 });
  try {
    await locked;
    await expect(repository.accept(event)).rejects.toThrow();
    expect(await db.consumedCirculationEvent.findUnique({ where: { eventId: event.eventId } })).toBeNull();
  } finally { release(); await blocker; }
  expect(await repository.accept(event)).toBe('APPLIED');
}, 12000);

async function until(check: () => Promise<boolean>, ms = 25000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Hết thời gian chờ điều kiện kiểm thử');
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Không lấy được cổng test');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}
test('Kafka thật: nhận fact, restart consumer/broker, gửi lặp và DLQ có ACK', async () => {
  const port = await freePort();
  docker('run', '-d', '--name', kafkaContainer, '--label', `lams.test=${kafkaContainer}`, '-p', `127.0.0.1:${port}:19092`,
    '-e', 'KAFKA_NODE_ID=1', '-e', 'KAFKA_PROCESS_ROLES=broker,controller',
    '-e', 'KAFKA_LISTENERS=PLAINTEXT://:19092,CONTROLLER://:19093',
    '-e', `KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://127.0.0.1:${port}`,
    '-e', 'KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER',
    '-e', 'KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT',
    '-e', 'KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:19093',
    '-e', 'KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1', '-e', 'KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0',
    '-e', 'CLUSTER_ID=MkU3OEVBNTcwNTJENDM2Qk', 'apache/kafka:4.1.0');
  kafkaCreated = true;
  const brokers = `127.0.0.1:${port}`;
  const kafka = new Kafka({ clientId: 'notification-test', brokers: [brokers], logLevel: logLevel.NOTHING,
    connectionTimeout: 1000, requestTimeout: 2000, retry: { retries: 5, initialRetryTime: 200, maxRetryTime: 2000 } });
  const admin = kafka.admin();
  try {
    await until(async () => { try { await admin.connect(); return true; } catch { return false; } }, 60000);
    await admin.createTopics({ waitForLeaders: true, topics: ['lams.circulation.events.v1', 'lams.hold.events.v1', notificationDlq].map(topic => ({ topic, numPartitions: 1, replicationFactor: 1 })) });
  } finally { await admin.disconnect(); }
  process.env.NOTIFICATIONS_ENABLED = 'true'; process.env.KAFKA_BOOTSTRAP_SERVERS = brokers; process.env.NOTIFICATIONS_GROUP_ID = `test-${randomUUID()}`;
  const letters: Array<Record<string, unknown>> = [];
  dlq = kafka.consumer({ groupId: `dlq-${randomUUID()}` }); await dlq.connect(); await dlq.subscribe({ topics: [notificationDlq], fromBeginning: true });
  await dlq.run({ eachMessage: async ({ message }) => { letters.push(JSON.parse(message.value!.toString())); } });
  events = new LoanEventsConsumer(repository); await events.onApplicationBootstrap();
  producer = kafka.producer(); await producer.connect();
  const ready = fact();
  const raw = { eventId: ready.eventId, eventType: ready.eventType, aggregateId: ready.aggregateId, aggregateVersion: ready.aggregateVersion,
    version: 1, occurredAt: ready.occurredAt, data: { id: ready.aggregateId, version: ready.aggregateVersion, status: 'READY', readerId: ready.readerId, expiresAt: ready.expiresAt } };
  const send = async (value: unknown) => { await producer!.send({ topic: 'lams.hold.events.v1', messages: [{ key: ready.aggregateId, value: JSON.stringify(value) }] }); };
  await send(raw); await until(async () => !!await db.consumedCirculationEvent.findUnique({ where: { eventId: ready.eventId } }));
  await events.onModuleDestroy(); events = new LoanEventsConsumer(repository); await events.onApplicationBootstrap();
  await send(raw);
  const endedId = randomUUID();
  await send({ ...raw, eventId: endedId, aggregateVersion: 2, eventType: 'HOLD_EXPIRED', data: { ...raw.data, status: 'EXPIRED', version: 2 } });
  await until(async () => (await db.circulationNotice.findUnique({ where: where(ready) }))?.eventId === endedId);
  expect(await db.consumedCirculationEvent.count({ where: { eventId: ready.eventId } })).toBe(1);
  await send({ ...raw, version: 99, secret: 'must-not-copy-to-dlq' });
  await until(async () => letters.length > 0);
  expect(letters[0]).toMatchObject({ reason: 'UNSUPPORTED_VERSION', event: null, source: { topic: 'lams.hold.events.v1' } });
  expect(JSON.stringify(letters)).not.toContain('must-not-copy-to-dlq');
  const failed = { ...raw, eventId: randomUUID(), aggregateId: randomUUID() };
  failed.data = { ...raw.data, id: failed.aggregateId };
  await db.$executeRawUnsafe('CREATE SEQUENCE notice_failure_attempts');
  await db.$executeRawUnsafe("CREATE FUNCTION reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('notice_failure_attempts'); RAISE EXCEPTION 'test-only storage failure'; END $$");
  await db.$executeRawUnsafe('CREATE TRIGGER fail_delivery BEFORE INSERT ON circulation_notices FOR EACH ROW EXECUTE FUNCTION reject_delivery()');
  try {
    await producer!.send({ topic: 'lams.hold.events.v1', messages: [{ key: failed.aggregateId, value: JSON.stringify(failed) }] });
    await until(async () => letters.some(v => v.reason === 'STORAGE_UNAVAILABLE'));
    expect(await db.consumedCirculationEvent.findUnique({ where: { eventId: failed.eventId } })).toBeNull();
    expect(await db.$queryRawUnsafe('SELECT last_value FROM notice_failure_attempts')).toEqual([{ last_value: 5n }]);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER fail_delivery ON circulation_notices');
    await db.$executeRawUnsafe('DROP FUNCTION reject_delivery()'); await db.$executeRawUnsafe('DROP SEQUENCE notice_failure_attempts');
  }
  // Replay có kiểm soát của chính fact gốc, giữ eventId; không dùng payload lỗi trong DLQ để ghi tùy ý.
  await producer!.send({ topic: 'lams.hold.events.v1', messages: [{ key: failed.aggregateId, value: JSON.stringify(failed) }] });
  await until(async () => !!await db.consumedCirculationEvent.findUnique({ where: { eventId: failed.eventId } }));
  // Đã kiểm DLQ; đóng watcher phụ trước khi chủ động làm broker gián đoạn.
  await dlq.disconnect(); dlq = undefined;
  docker('restart', '-t', '3', kafkaContainer);
  const afterRestart = { ...raw, eventId: randomUUID(), aggregateId: randomUUID() };
  afterRestart.data = { ...raw.data, id: afterRestart.aggregateId };
  await until(async () => {
    try { await producer!.send({ topic: 'lams.hold.events.v1', messages: [{ key: afterRestart.aggregateId, value: JSON.stringify(afterRestart) }] }); return true; }
    catch { return false; }
  }, 60000);
  await until(async () => !!await db.consumedCirculationEvent.findUnique({ where: { eventId: afterRestart.eventId } }), 60000);
}, 150000);
