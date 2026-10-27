import { PrismaClient } from '@prisma/client';

const value = process.argv[2];
if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value) {
  throw new Error('Truyền mốc UTC dạng YYYY-MM-DDTHH:mm:ssZ. Lệnh này chỉ đếm, không xóa dữ liệu.');
}
if (!process.env.INSIGHT_DATABASE_URL) throw new Error('Cần INSIGHT_DATABASE_URL để kết nối Insight.');

const db = new PrismaClient();
try {
  const before = new Date(value);
  const [recommendations, drafts, decisions] = await db.$transaction([
    db.acquisitionRecommendation.count({ where: { createdAt: { lt: before } } }),
    db.acquisitionRecommendation.count({ where: { createdAt: { lt: before }, state: 'DRAFT' } }),
    db.acquisitionDecision.count({ where: { createdAt: { lt: before } } }),
  ]);
  process.stdout.write(JSON.stringify({ before: value, recommendations, drafts, decisions,
    evidenceSnapshots: recommendations, note: 'Chỉ thống kê. Chưa có thời hạn lưu được phê duyệt hoặc lệnh xóa.' }, null, 2) + '\n');
} finally {
  await db.$disconnect();
}
