import { z } from 'zod';
import { coreApi } from '../../shared/api/client';

export const memberStatus = z.enum(['ACTIVE', 'LOCKED', 'DISABLED']);
export const statusLabels = { ACTIVE: 'Đang hoạt động', LOCKED: 'Đã khóa', DISABLED: 'Đã vô hiệu hóa' };
const memberItem = z.object({
  userId: z.string().uuid(), memberCode: z.string(), fullName: z.string(), status: memberStatus,
});
const currentProfile = memberItem.extend({
  email: z.string().email(),
  profile: z.object({ createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).nullable(),
});
const memberPage = z.object({
  items: z.array(memberItem),
  page: z.object({
    number: z.number().int().nonnegative(), size: z.number().int().min(1).max(100),
    totalElements: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(),
  }),
});
const integerParam = (fallback: number, min: number, max: number) => z.string().regex(/^\d+$/)
  .transform(Number).pipe(z.number().int().min(min).max(max)).default(fallback);
const querySchema = z.object({
  query: z.string().trim().max(150).default(''),
  status: z.union([memberStatus, z.literal('')]).default(''),
  page: integerParam(0, 0, 2147483647),
  size: integerParam(20, 1, 100),
  sort: z.enum(['memberCode,asc', 'memberCode,desc', 'fullName,asc', 'fullName,desc']).default('memberCode,asc'),
});
export type MemberQuery = z.output<typeof querySchema>;
export type MemberProfile = z.output<typeof currentProfile>;

export function parseMemberQuery(params: URLSearchParams) {
  const values = Object.fromEntries(['query', 'status', 'page', 'size', 'sort']
    .flatMap(key => params.has(key) ? [[key, params.get(key)]] : []));
  return querySchema.safeParse(values);
}
export function memberQueryParams(query: MemberQuery) {
  const params = new URLSearchParams({ page: String(query.page), size: String(query.size), sort: query.sort });
  if (query.query) params.set('query', query.query);
  if (query.status) params.set('status', query.status);
  return params;
}
export async function getProfile(signal?: AbortSignal) {
  return currentProfile.parse(await coreApi.get<unknown>('/me/profile', true, signal));
}
export async function getMembers(query: MemberQuery, signal?: AbortSignal) {
  return memberPage.parse(await coreApi.get<unknown>(`/members?${memberQueryParams(query)}`, true, signal));
}
