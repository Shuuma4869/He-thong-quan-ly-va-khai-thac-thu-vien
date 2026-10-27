import { z } from 'zod';
import { coreApi } from '../../shared/api/client';

const accountSchema = z.object({ userId: z.string().uuid(), memberCode: z.string(), fullName: z.string(),
  email: z.string().email(), status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED']),
  phone: z.string().nullable(), pendingEmail: z.string().email().nullable(),
  pendingEmailRequestedAt: z.string().datetime().nullable() });
export type Account = z.infer<typeof accountSchema>;
export async function getAccount(signal?: AbortSignal) {
  return accountSchema.parse(await coreApi.get<unknown>('/me/account', true, signal));
}
export async function updateAccount(fullName: string, phone: string) {
  return accountSchema.parse(await coreApi.patch<unknown>('/me/account', { fullName, phone }));
}
export async function changePassword(currentPassword: string, newPassword: string) {
  await coreApi.post<void>('/me/account/password', { currentPassword, newPassword });
}
export async function requestEmail(currentPassword: string, email: string) {
  return accountSchema.parse(await coreApi.post<unknown>('/me/account/email-request', { currentPassword, email }));
}
export async function cancelEmailRequest() { await coreApi.delete<void>('/me/account/email-request'); }
