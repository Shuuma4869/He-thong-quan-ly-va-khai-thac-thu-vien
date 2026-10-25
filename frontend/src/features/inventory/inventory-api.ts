import { z } from 'zod';
import { coreApi } from '../../shared/api/client';

const uuid = z.string().uuid();
const instant = z.string().datetime();
const pagination = z.object({ page: z.number().int().nonnegative(), size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() });
const pageOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), page: pagination });

export const sessionSchema = z.object({ id: uuid, branchId: uuid, shelfId: uuid.nullable(), openedBy: uuid,
  openedAt: instant, status: z.enum(['OPEN', 'FINALIZED', 'CANCELLED']), version: z.number().int().nonnegative(),
  snapshotCount: z.number().int().nonnegative(), scanCount: z.number().int().nonnegative(),
  closedAt: instant.nullable(), closedBy: uuid.nullable(), closeReason: z.string().nullable() });
const copy = z.object({ id: uuid, barcode: z.string(), branchId: uuid, shelfId: uuid,
  status: z.string(), version: z.number().int().nonnegative() });
const scan = z.object({ id: uuid, clientScanId: uuid, barcode: z.string(), branchId: uuid, shelfId: uuid,
  scannedBy: uuid, receivedAt: instant, clientScannedAt: instant.nullable() });
const evidence = z.object({ id: uuid, kind: z.string(), sessionId: uuid, copyId: uuid.nullable(),
  scan: z.object({ id: uuid, barcode: z.string(), branchId: uuid, shelfId: uuid,
    scannedAt: instant, actorId: uuid }).nullable(), snapshot: copy.nullable(), current: copy.nullable(),
  firstScanId: uuid.nullable() });
const resolution = z.object({ id: uuid, anomalyId: uuid, action: z.enum(['REVIEWED', 'MOVE_TO_SCANNED_SHELF']),
  reason: z.string(), copyVersionSeen: z.number().int().nonnegative().nullable(),
  copyVersionAfter: z.number().int().nonnegative().nullable(), resolvedBy: uuid, resolvedAt: instant });
const anomaly = z.object({ id: uuid, kind: z.enum(['WRONG_SHELF', 'EXPECTED_BUT_MISSING', 'STATUS_MISMATCH',
  'WRONG_BRANCH', 'UNKNOWN_BARCODE', 'DUPLICATE_SCAN']), copyId: uuid.nullable(), evidence,
  detectedAt: instant, resolution: resolution.nullable() });
const shelf = z.object({ id: uuid, branchId: uuid, branchCode: z.string(), code: z.string(),
  label: z.string(), sortOrder: z.number().int() });

export type InventorySession = z.infer<typeof sessionSchema>;
export type InventoryPage<T> = { items: T[]; page: z.infer<typeof pagination> };
export type InventoryCopy = z.infer<typeof copy>;
export type InventoryScan = z.infer<typeof scan>;
export type InventoryAnomaly = z.infer<typeof anomaly>;
export type InventoryShelf = z.infer<typeof shelf>;

function checkedId(id: string) { return uuid.parse(id); }
function path(id: string) { return `/inventory-sessions/${checkedId(id)}`; }
function params(page: number, size = 20) {
  return new URLSearchParams({ page: String(z.number().int().min(0).max(10000).parse(page)), size: String(size) });
}
export async function listSessions(branchId: string, status: string, page: number, signal?: AbortSignal) {
  const query = params(page);
  if (branchId) query.set('branchId', checkedId(branchId));
  if (status) query.set('status', z.enum(['OPEN', 'FINALIZED', 'CANCELLED']).parse(status));
  return pageOf(sessionSchema).parse(await coreApi.get<unknown>(`/inventory-sessions?${query}`, true, signal));
}
export async function getSession(id: string, signal?: AbortSignal) {
  return sessionSchema.parse(await coreApi.get<unknown>(path(id), true, signal));
}
export async function listSnapshot(id: string, page: number, signal?: AbortSignal) {
  return pageOf(copy).parse(await coreApi.get<unknown>(`${path(id)}/snapshot?${params(page)}`, true, signal));
}
export async function listScans(id: string, page: number, signal?: AbortSignal) {
  return pageOf(scan).parse(await coreApi.get<unknown>(`${path(id)}/scans?${params(page)}`, true, signal));
}
export async function listAnomalies(id: string, page: number, signal?: AbortSignal) {
  return pageOf(anomaly).parse(await coreApi.get<unknown>(`${path(id)}/anomalies?${params(page)}`, true, signal));
}
export async function listShelves(branchId: string, page: number, signal?: AbortSignal) {
  const query = params(page);
  query.set('branchId', checkedId(branchId));
  return z.object({ items: z.array(shelf), page: z.object({ number: z.number().int().nonnegative(),
    size: z.number().int().positive(), totalElements: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative() }) }).parse(await coreApi.get<unknown>(`/shelves?${query}`, true, signal));
}
export async function startSession(branchId: string, shelfId: string | null, requestId: string) {
  return sessionSchema.parse(await coreApi.post<unknown>('/inventory-sessions', {
    requestId: checkedId(requestId), branchId: checkedId(branchId), shelfId: shelfId ? checkedId(shelfId) : null }));
}
export async function addScan(id: string, barcode: string, shelfId: string, clientScanId: string) {
  return z.object({ id: uuid, sessionId: uuid, clientScanId: uuid, barcode: z.string(), branchId: uuid,
    shelfId: uuid, scannedBy: uuid, receivedAt: instant, clientScannedAt: instant.nullable(),
    sessionVersion: z.number().int().nonnegative() }).parse(await coreApi.post<unknown>(`${path(id)}/scans`, {
    clientScanId: checkedId(clientScanId), barcode: z.string().trim().min(1).max(100).parse(barcode), shelfId: checkedId(shelfId) }));
}
export async function closeSession(id: string, version: number, reason: string, requestId: string, cancel: boolean) {
  return sessionSchema.parse(await coreApi.post<unknown>(`${path(id)}/${cancel ? 'cancel' : 'finalize'}`, {
    requestId: checkedId(requestId), version: z.number().int().nonnegative().parse(version), reason: reason.trim() || null }));
}
export async function resolveAnomaly(sessionId: string, anomalyId: string,
  action: 'REVIEWED' | 'MOVE_TO_SCANNED_SHELF', reason: string, expectedCopyVersion: number | null, requestId: string) {
  return resolution.parse(await coreApi.post<unknown>(`${path(sessionId)}/anomalies/${checkedId(anomalyId)}/resolution`, {
    requestId: checkedId(requestId), action, reason: z.string().trim().min(1).max(500).parse(reason),
    expectedCopyVersion: expectedCopyVersion === null ? null : z.number().int().nonnegative().parse(expectedCopyVersion),
  }));
}
