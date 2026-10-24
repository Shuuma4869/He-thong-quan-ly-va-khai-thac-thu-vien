import { z } from 'zod';
import { coreApi } from '../../shared/api/client';
import { pageSchema, schemas } from '../catalog/catalog-api';

const uuid = z.string().uuid();
const time = z.string().datetime();
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const loanResultSchema = z.object({ loanId: uuid, copyId: uuid, readerId: uuid, editionId: uuid, branchId: uuid,
  borrowedAt: time, dueAt: time, returnedAt: time.nullable(), renewalCount: z.number().int().nonnegative(), version, copyVersion: version });
export const loanSchema = loanResultSchema.extend({ bookTitle: z.string(), barcode: z.string(), branchName: z.string(),
  status: z.enum(['ACTIVE', 'OVERDUE', 'RETURNED']), overdue: z.boolean() });
export const holdSchema = z.object({ id: uuid, readerId: uuid, bookId: uuid, editionId: uuid.nullable(), branchId: uuid,
  status: z.enum(['WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED']), queuedAt: time, readyAt: time.nullable(),
  expiresAt: time.nullable(), closedAt: time.nullable(), copyId: uuid.nullable(), loanId: uuid.nullable(), version,
  policyVersion: z.string(), pickupSeconds: z.number().int().positive() });
const holdView = z.object({ hold: holdSchema, queuePosition: z.number().int().positive().nullable(), bookTitle: z.string(), branchName: z.string() });
export type Loan = z.infer<typeof loanSchema>;
export type HoldView = z.infer<typeof holdView>;
export type LoanQuery = { page: number; status?: string; from?: string; to?: string; readerId?: string; branchId?: string; copyId?: string };
export function loanParams(query: LoanQuery) {
  const params = new URLSearchParams({ page: String(query.page), size: '10', sort: 'borrowedAt,desc' });
  for (const key of ['status', 'from', 'to', 'readerId', 'branchId', 'copyId'] as const) if (query[key]) params.set(key, query[key]);
  return params;
}
export async function getLoans(query: LoanQuery, staff = false, signal?: AbortSignal) {
  return z.object({ items: z.array(loanSchema), page: pageSchema, asOf: time })
    .parse(await coreApi.get(`${staff ? '/loans' : '/me/loans'}?${loanParams(query)}`, true, signal));
}
export async function getMyHolds(page: number, signal?: AbortSignal) {
  return z.object({ items: z.array(holdView), page: pageSchema })
    .parse(await coreApi.get(`/me/holds?page=${page}&size=10`, true, signal));
}
export async function getPickupBranches(page: number, signal?: AbortSignal) {
  return z.object({ items: z.array(z.object({ id: uuid, code: z.string(), name: z.string() })), page: pageSchema })
    .parse(await coreApi.get(`/holds/pickup-branches?page=${page}&size=20`, true, signal));
}
export async function renewLoan(id: string, currentVersion: number, requestId: string) {
  return loanResultSchema.parse(await coreApi.post(`/loans/${uuid.parse(id)}/renew`, { requestId: uuid.parse(requestId), version: version.parse(currentVersion) }));
}
export async function cancelHold(id: string, currentVersion: number, requestId: string) {
  return holdSchema.parse(await coreApi.post(`/holds/${uuid.parse(id)}/cancel`, { requestId: uuid.parse(requestId), version: version.parse(currentVersion) }));
}
export type HoldInput = { bookId: string; editionId: string | null; branchId: string; anyEdition: boolean };
export async function createHold(input: HoldInput, requestId: string) {
  const payload = z.object({ bookId: uuid, editionId: uuid.nullable(), branchId: uuid, anyEdition: z.boolean() })
    .refine(value => value.anyEdition ? value.editionId === null : value.editionId !== null).parse(input);
  return holdSchema.parse(await coreApi.post('/holds', { ...payload, requestId: uuid.parse(requestId) }));
}
export type Copy = z.infer<typeof schemas.copies>;
export async function findCopy(barcode: string, signal?: AbortSignal) {
  return schemas.copies.parse(await coreApi.get(`/copies/by-barcode?${new URLSearchParams({ barcode })}`, true, signal));
}
export async function borrowCopy(copy: Copy, readerId: string, requestId: string) {
  return loanResultSchema.parse(await coreApi.post('/loans', { requestId: uuid.parse(requestId), copyId: copy.id,
    readerId: uuid.parse(readerId), branchId: copy.branchId, copyVersion: version.parse(copy.version) }));
}
export async function returnLoan(loan: Loan, requestId: string) {
  return loanResultSchema.parse(await coreApi.post(`/loans/${uuid.parse(loan.loanId)}/return`, {
    requestId: uuid.parse(requestId), branchId: loan.branchId, version: version.parse(loan.version) }));
}
