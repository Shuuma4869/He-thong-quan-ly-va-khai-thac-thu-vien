import { z } from 'zod';
import { coreApi } from '../../shared/api/client';

const role = z.enum(['READER', 'LIBRARIAN', 'ADMIN']);
const account = z.object({ id: z.string().uuid(), memberCode: z.string(), fullName: z.string(),
  email: z.string().email(), status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED']), roles: z.array(role),
  version: z.number().int().nonnegative(), createdAt: z.string().datetime() });
const pageSchema = z.object({ items: z.array(account), number: z.number().int(),
  size: z.number().int(), totalElements: z.number().int() });
const auditSchema = z.array(z.object({ id: z.string().uuid(), actorId: z.string().uuid(),
  targetId: z.string().uuid(), action: z.enum(['STATUS', 'ROLE_GRANT', 'ROLE_REVOKE']),
  beforeValue: z.string(), afterValue: z.string(), reason: z.string(),
  targetVersion: z.number().int(), createdAt: z.string().datetime() }));
export type AdminAccount = z.infer<typeof account>;
export type AdminRole = z.infer<typeof role>;

export async function listAccounts(query: string, status: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), size: '20' });
  if (query) params.set('query', query);
  if (status) params.set('status', status);
  return pageSchema.parse(await coreApi.get<unknown>(`/admin/accounts?${params}`, true, signal));
}
export async function getAccountDetail(id: string, signal?: AbortSignal) {
  return account.parse(await coreApi.get<unknown>(`/admin/accounts/${id}`, true, signal));
}
export async function getAccountAudit(id: string, signal?: AbortSignal) {
  return auditSchema.parse(await coreApi.get<unknown>(`/admin/accounts/${id}/audit`, true, signal));
}
export async function changeAccountStatus(id: string, version: number, status: 'ACTIVE' | 'LOCKED', reason: string) {
  return account.parse(await coreApi.patch<unknown>(`/admin/accounts/${id}/status`,
    { expectedVersion: version, status, reason }));
}
export async function changeAccountRole(id: string, version: number, selectedRole: AdminRole, grant: boolean, reason: string) {
  return account.parse(await coreApi.patch<unknown>(`/admin/accounts/${id}/roles/${selectedRole}`,
    { expectedVersion: version, grant, reason }));
}
