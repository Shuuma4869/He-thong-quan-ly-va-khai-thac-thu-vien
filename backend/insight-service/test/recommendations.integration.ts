import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/discovery/metadata/history/prisma.service';
import { RecommendationWorkflow } from '../src/acquisition/recommendation-workflow';
import { acquisitionSourceVersion, type AcquisitionScope, type AcquisitionSourceSnapshot } from '../src/acquisition/acquisition-source';

const container = `lams-acquisition-test-${randomUUID()}`;
const password = randomUUID();
const previous = process.env.INSIGHT_DATABASE_URL;
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let created = false;
let db: PrismaService;
let workflow: RecommendationWorkflow;
const maker = randomUUID();
const reviewer = randomUUID();

beforeAll(async () => {
  docker('info');
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
  db = new PrismaService();
  await db.onModuleInit();
  workflow = new RecommendationWorkflow(db);
}, 90000);

afterAll(async () => {
  if (db) await db.onApplicationShutdown();
  if (created && docker('inspect', '--format', '{{index .Config.Labels "lams.test"}}', container) === container)
    docker('rm', '-f', '-v', container);
  if (previous === undefined) delete process.env.INSIGHT_DATABASE_URL;
  else process.env.INSIGHT_DATABASE_URL = previous;
});

function source(): { scope: AcquisitionScope; snapshot: AcquisitionSourceSnapshot } {
  const bookId = randomUUID(), branchId = randomUUID();
  const from = '2026-01-01T00:00:00Z', to = '2026-02-01T00:00:00Z';
  return {
    scope: { bookId, branchId, from, to },
    snapshot: {
      contractVersion: acquisitionSourceVersion, sourceRevision: randomUUID(), bookId, branchId,
      window: { from, to, asOf: '2026-02-02T00:00:00Z' }, copiesOwned: 3, copiesAvailable: 1,
      waitingHolds: { count: 2, basis: 'CURRENT_STATE', source: 'core-holds', unavailableReason: null },
      loansStarted: { count: 5, basis: 'WINDOWED_ROWS', source: 'core-loans', unavailableReason: null },
      favoritesAdded: { count: null, basis: null, source: null, unavailableReason: 'Chưa có read projection.' },
    },
  };
}

test('migration lưu bằng chứng, quyết định thủ công và nhật ký qua kết nối mới', async () => {
  const { scope, snapshot } = source();
  const draft = await workflow.createDraft(maker, scope, snapshot);
  expect(draft).toMatchObject({ state: 'DRAFT', version: 0, createdBy: maker, sourceRevision: snapshot.sourceRevision });
  expect(draft.evidence).toMatchObject({ manualReviewRequired: true, purchaseDecisionAllowed: false });
  await db.$disconnect(); await db.$connect();
  expect((await workflow.list(0, 10, 'DRAFT')).items.map(item => item.id)).toContain(draft.id);
  const approved = await workflow.decide(draft.id, reviewer, 'APPROVED', 'Đã đối chiếu số liệu tại thư viện.', 0);
  expect(approved).toMatchObject({ state: 'APPROVED', version: 1, reviewedBy: reviewer });
  expect(approved.decisions).toHaveLength(1);
  expect(approved.decisions[0]).toMatchObject({ action: 'APPROVED', actorId: reviewer, version: 1 });
  await db.$disconnect(); await db.$connect();
  expect((await workflow.get(draft.id)).decisions).toHaveLength(1);
  await expect(workflow.decide(draft.id, reviewer, 'REJECTED', 'Đã thay đổi quyết định.', 1)).rejects.toBeInstanceOf(ConflictException);
  await expect(workflow.createDraft(maker, scope, snapshot)).rejects.toBeInstanceOf(ConflictException);
});

test('chỉ một quyết định thắng khi hai nhân viên dùng cùng version', async () => {
  const { scope, snapshot } = source();
  const draft = await workflow.createDraft(maker, scope, snapshot);
  const results = await Promise.allSettled([
    workflow.decide(draft.id, reviewer, 'APPROVED', 'Đã kiểm tra nhu cầu mua sách.', 0),
    workflow.decide(draft.id, maker, 'REJECTED', 'Không đủ cơ sở để mua sách.', 0),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  const record = await workflow.get(draft.id);
  expect(record.version).toBe(1);
  expect(record.decisions).toHaveLength(1);
});

test('từ chối revision nguồn sai và không tạo bản ghi', async () => {
  const { scope, snapshot } = source();
  const before = await db.acquisitionRecommendation.count();
  await expect(workflow.createDraft(maker, scope, { ...snapshot, sourceRevision: ` ${snapshot.sourceRevision}` }))
    .rejects.toThrow('Phiên bản nguồn không hợp lệ.');
  await expect(workflow.createDraft(maker, scope, { ...snapshot, copiesAvailable: 4 }))
    .rejects.toThrow('Số bản sẵn có vượt tổng số bản.');
  expect(await db.acquisitionRecommendation.count()).toBe(before);
});

test('CSV lấy dữ liệu thật và vô hiệu hóa công thức trong lời duyệt', async () => {
  const { scope, snapshot } = source();
  const draft = await workflow.createDraft(maker, scope, snapshot);
  await workflow.decide(draft.id, reviewer, 'REJECTED', '=HYPERLINK("https://example.test","10 điểm")', 0);
  const csv = await workflow.exportCsv('REJECTED');
  expect(csv.startsWith('\uFEFFid,bookId,branchId')).toBe(true);
  expect(csv).toContain(draft.id);
  expect(csv).toContain("'=HYPERLINK(");
  expect(csv).toContain('""https://example.test""');
  expect((await workflow.exportCsv('DRAFT')).includes(draft.id)).toBe(false);
});
