import { z } from 'zod';
import { insightApi } from '../../shared/api/client';

const uuid = z.string().uuid();
const dateTime = z.string().datetime();
const number = z.coerce.number().finite().min(0);
const signal = z.object({ count: z.number().int().nonnegative().nullable(), basis: z.string().nullable(),
  source: z.string().nullable(), unavailableReason: z.string().nullable() });
const component = z.object({ count: z.number().int().nonnegative().nullable(), normalized: number.max(1).nullable(),
  contribution: number.max(100), weight: number.max(1) });
const evidence = z.object({ copiesOwned: z.number().int().nonnegative(), copiesAvailable: z.number().int().nonnegative(),
  waitingHolds: signal, loansStarted: signal, favoritesAdded: signal,
  components: z.object({ waitingHolds: component, loansStarted: component, favoritesAdded: component }),
  omittedSignals: z.array(z.string()), manualReviewRequired: z.literal(true), purchaseDecisionAllowed: z.literal(false) });
const decision = z.object({ id: uuid, recommendationId: uuid, action: z.enum(['APPROVED', 'REJECTED']),
  actorId: uuid, reason: z.string(), version: z.number().int().positive(), createdAt: dateTime });
export const recommendationSchema = z.object({ id: uuid, bookId: uuid, branchId: uuid,
  windowFrom: dateTime, windowTo: dateTime, snapshotAt: dateTime,
  sourceContractVersion: z.string(), sourceRevision: z.string(), scoreVersion: z.string(),
  score: number.max(100), confidence: number.max(1), evidence,
  state: z.enum(['DRAFT', 'APPROVED', 'REJECTED']), version: z.number().int().nonnegative(),
  createdBy: uuid, createdAt: dateTime, reviewedBy: uuid.nullable(), reviewedAt: dateTime.nullable(),
  reviewReason: z.string().nullable(), decisions: z.array(decision).optional() });
const page = z.object({ items: z.array(recommendationSchema), page: z.object({ number: z.number().int().nonnegative(),
  size: z.number().int().min(1).max(50), totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative() }) });

export type Recommendation = z.infer<typeof recommendationSchema>;
export type RecommendationState = Recommendation['state'];
export const acquisitionScopeSchema = z.object({ bookId: uuid, branchId: uuid,
  from: dateTime, to: dateTime }).refine(value => Date.parse(value.to) > Date.parse(value.from)
    && Date.parse(value.to) <= Date.now() && Date.parse(value.to) - Date.parse(value.from) <= 366 * 86_400_000);
export type AcquisitionScope = z.infer<typeof acquisitionScopeSchema>;
const sourceSnapshot = z.object({ contractVersion: z.literal('acquisition-source-v1'), sourceRevision: z.string(),
  bookId: uuid, branchId: uuid, window: z.object({ from: dateTime, to: dateTime, asOf: dateTime }),
  copiesOwned: z.number().int().nonnegative(), copiesAvailable: z.number().int().nonnegative(),
  waitingHolds: signal, loansStarted: signal, favoritesAdded: signal });
const score = z.object({ version: z.string(), score: number.max(100), confidence: number.max(1),
  band: z.enum(['LOW', 'MEDIUM', 'HIGH']), components: z.object({ waitingHolds: component,
    loansStarted: component, favoritesAdded: component }), omittedSignals: z.array(z.string()) });
const analysis = z.object({ snapshot: sourceSnapshot, score });

export async function analyzeAcquisition(raw: AcquisitionScope) {
  const scope = acquisitionScopeSchema.parse(raw);
  return analysis.parse(await insightApi.get<unknown>(`/acquisition/analysis?${new URLSearchParams(scope)}`));
}
export async function createRecommendation(raw: AcquisitionScope) {
  const scope = acquisitionScopeSchema.parse(raw);
  return recommendationSchema.parse(await insightApi.post<unknown>('/acquisition/recommendations', scope));
}

export async function listRecommendations(state: RecommendationState | '', number: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(z.number().int().min(0).max(1000000).parse(number)), size: '20' });
  if (state) params.set('state', state);
  return page.parse(await insightApi.get<unknown>(`/acquisition/recommendations?${params}`, true, signal));
}
export async function getRecommendation(id: string, signal?: AbortSignal) {
  return recommendationSchema.parse(await insightApi.get<unknown>(`/acquisition/recommendations/${uuid.parse(id)}`, true, signal));
}
export async function decideRecommendation(id: string, action: 'APPROVED' | 'REJECTED', reason: string, expectedVersion: number) {
  const note = z.string().trim().min(10).max(1000).parse(reason);
  return recommendationSchema.parse(await insightApi.post<unknown>(`/acquisition/recommendations/${uuid.parse(id)}/decision`, {
    action, reason: note, expectedVersion: z.number().int().nonnegative().parse(expectedVersion),
  }));
}
