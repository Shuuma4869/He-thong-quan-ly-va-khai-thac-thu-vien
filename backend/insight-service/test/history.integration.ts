import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../src/discovery/metadata/history/prisma.service';
import { HistoryRepository } from '../src/discovery/metadata/history/history.repository';
import { HistoryQuery } from '../src/discovery/metadata/history/history.dto';

// Chỉ tạo container tạm không volume, không đọc DATABASE_URL của môi trường dev.
const container = `lams-insight-test-${randomUUID()}`;
const password = randomUUID();
const previous = process.env.INSIGHT_DATABASE_URL;
let created = false;
let db: PrismaService;
let repository: HistoryRepository;
const owner = randomUUID();
const other = randomUUID();
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
beforeAll(async () => {
  docker('info');
  docker('run', '-d', '--name', container, '--label', `lams.test=${container}`, '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', 'POSTGRES_DB=lams_insight_test', '-p', '127.0.0.1::5432', 'postgres:17.6-alpine');
  created = true;
  const binding = docker('port', container, '5432/tcp');
  const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1];
  if (!port) throw new Error('Database test phải nằm trên loopback');
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { docker('exec', container, 'pg_isready', '-U', 'postgres'); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error('PostgreSQL test chưa sẵn sàng');
  process.env.INSIGHT_DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/lams_insight_test`;
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'pipe', env: process.env });
  db = new PrismaService();
  await db.onModuleInit();
  repository = new HistoryRepository(db);
}, 90000);
afterAll(async () => {
  if (db) await db.onModuleDestroy();
  if (created && docker('inspect', '--format', '{{index .Config.Labels "lams.test"}}', container) === container) docker('rm', '-f', container);
  if (previous === undefined) delete process.env.INSIGHT_DATABASE_URL; else process.env.INSIGHT_DATABASE_URL = previous;
});
test('migration sạch, ORM persistence và projection không lộ owner', async () => {
  const record = await repository.create(owner, '9780132350884', [{ provider: 'open-library', status: 'ok' }]);
  expect(record).not.toHaveProperty('ownerId');
  await db.$disconnect(); await db.$connect();
  expect(await repository.find(owner, record.id)).toMatchObject({ isbn13: '9780132350884' });
  expect(await repository.find(other, record.id)).toBeNull();
  expect((await repository.delete(other, record.id)).count).toBe(0);
  expect((await repository.delete(owner, record.id)).count).toBe(1);
});
test('filter/pagination ổn định và chỉ dữ liệu chủ sở hữu', async () => {
  const a = randomUUID();
  for (let i = 0; i < 3; i++) await repository.create(a, '9780132350884', []);
  await repository.create(other, '9780132350884', []);
  const query = Object.assign(new HistoryQuery(), { size: 2, isbn: '978013' });
  const first = await repository.list(a, query);
  const second = await repository.list(a, { ...query, page: 1 });
  expect(first.page.totalElements).toBe(3);
  expect(second.items).toHaveLength(1);
  expect(first.items.map(item => item.id)).not.toContain(second.items[0].id);
  expect((await repository.list(a, { ...query, isbn: '000' })).items).toEqual([]);
  const older = await repository.create(a, '9780140328721', []);
  await db.metadataLookup.update({ where: { id: older.id }, data: { createdAt: new Date('2020-01-01T00:00:00Z') } });
  expect((await repository.list(a, { ...query, isbn: undefined, sort: 'oldest' })).items[0].id).toBe(older.id);
  expect((await repository.list(a, { ...query, isbn: undefined, sort: 'newest' })).items[0].id).not.toBe(older.id);
});
test('database chặn ISBN không hợp lệ và migration deploy lặp không mất dữ liệu', async () => {
  await expect(repository.create(owner, 'bad', [])).rejects.toThrow();
  const record = await repository.create(owner, '9780132350884', []);
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'pipe', env: process.env });
  expect(await repository.find(owner, record.id)).not.toBeNull();
});
test('upgrade foundation giữ metadata và thêm history trong schema test riêng', async () => {
  await db.$executeRawUnsafe('CREATE SCHEMA upgrade_test');
  const foundation=readFileSync('prisma/migrations/20250925000000_foundation/migration.sql','utf8');
  docker('exec',container,'psql','-U','postgres','-d','lams_insight_test','-v','ON_ERROR_STOP=1','-c',`SET search_path TO upgrade_test; ${foundation}`);
  const url=new URL(process.env.INSIGHT_DATABASE_URL!);url.searchParams.set('schema','upgrade_test');
  const env={...process.env,INSIGHT_DATABASE_URL:url.toString()};
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','resolve','--applied','20250925000000_foundation'],{stdio:'pipe',env});
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{stdio:'pipe',env});
  const upgraded=new PrismaService({datasourceUrl:url.toString()});
  try {
    await upgraded.$connect();
    expect(await upgraded.serviceMetadata.findUnique({where:{key:'schema_stage'}})).toMatchObject({value:'foundation'});
    expect(await new HistoryRepository(upgraded).create(owner,'9780132350884',[])).toHaveProperty('id');
  } finally { await upgraded.$disconnect(); }
},30000);
