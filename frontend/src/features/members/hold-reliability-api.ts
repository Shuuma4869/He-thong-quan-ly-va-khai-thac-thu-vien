import { z } from 'zod';
import { coreApi } from '../../shared/api/client';

const id = z.string().uuid();
const incident = z.object({ holdId: id, readyAt: z.string().datetime(), expiresAt: z.string().datetime(),
  closedAt: z.string().datetime(), decision: z.enum(['UNREVIEWED', 'CONFIRMED', 'EXCUSED']),
  decisionVersion: z.number().int().nonnegative(), reason: z.string().nullable(), decidedAt: z.string().datetime().nullable(),
  decisionPolicyVersion: z.string().nullable() });
const summary = z.object({ policyVersion: z.string(), from: z.string().datetime(), to: z.string().datetime(),
  confirmed: z.number().int().nonnegative(), unreviewed: z.number().int().nonnegative(),
  excused: z.number().int().nonnegative(), advisoryLevel: z.enum(['CLEAR', 'WATCH', 'REVIEW']),
  restrictionsEnabled: z.boolean(), recentIncidents: z.array(incident) });
export type HoldReliability = z.infer<typeof summary>;

export async function getHoldReliability(readerId: string, signal?: AbortSignal) {
  return summary.parse(await coreApi.get(`/staff/readers/${id.parse(readerId)}/hold-reliability`, true, signal));
}
export async function getMyHoldReliability(signal?: AbortSignal) {
  return summary.parse(await coreApi.get('/me/hold-reliability', true, signal));
}
export async function decideHoldNoShow(holdId: string, expectedVersion: number,
  decision: 'CONFIRMED' | 'EXCUSED', reason: string) {
  return summary.parse(await coreApi.patch(`/admin/holds/${id.parse(holdId)}/no-show`,
    { expectedVersion, decision, reason }));
}
