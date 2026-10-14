import { afterEach, expect, it, vi } from 'vitest';
import { getMembers, getProfile, parseMemberQuery } from './member-api';
import { configureCoreAuth } from '../../shared/api/client';

const row = { userId: '1f6322af-8f00-4cb0-8b06-c6f6934e268a', memberCode: 'TV-1234', fullName: 'Nguyễn An', status: 'ACTIVE' };
afterEach(() => { vi.unstubAllGlobals(); configureCoreAuth(null); });
it('gửi đúng query Unicode, giữ ký tự SQL như dữ liệu và đọc envelope page', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({
    items: [{ ...row, passwordHash: 'must-not-escape-parser' }],
    page: { number: 2, size: 10, totalElements: 21, totalPages: 3 },
  }));
  vi.stubGlobal('fetch', fetch);
  const query = { query: "Nguyễn %_'", status: 'ACTIVE' as const, page: 2, size: 10, sort: 'fullName,desc' as const };
  const result = await getMembers(query);
  expect(Object.fromEntries(new URL(fetch.mock.calls[0][0]).searchParams)).toEqual({
    query: query.query, status: 'ACTIVE', page: '2', size: '10', sort: 'fullName,desc',
  });
  expect(result.items[0]).toEqual(row);
  expect(result.page.totalPages).toBe(3);
});
it('parse profile null và từ chối response thiếu trường bắt buộc', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ...row, email: 'an@example.test', profile: null }))
    .mockResolvedValueOnce(Response.json({ ...row, email: 'an@example.test' }));
  vi.stubGlobal('fetch', fetch);
  expect((await getProfile()).profile).toBeNull();
  await expect(getProfile()).rejects.toThrow();
});
it('validate URL và mặc định page/size/sort, không âm thầm gửi giá trị sai', () => {
  expect(parseMemberQuery(new URLSearchParams()).data).toEqual({
    query: '', status: '', page: 0, size: 20, sort: 'memberCode,asc',
  });
  for (const query of ['page=-1', 'size=101', 'page=1e2', 'status=ROOT', 'sort=email,asc', 'query=' + 'x'.repeat(151)]) {
    expect(parseMemberQuery(new URLSearchParams(query)).success).toBe(false);
  }
});
