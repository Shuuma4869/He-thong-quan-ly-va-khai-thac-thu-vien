export const acquisitionScoreVersion = 'acquisition-v1';

export interface DemandWindow {
  from: string;
  to: string;
  asOf: string;
}

export interface DemandFacts {
  bookId: string;
  branchId: string;
  window: DemandWindow;
  copiesOwned: number;
  copiesAvailable: number;
  waitingHolds: number | null;
  loansStarted: number | null;
  favoritesAdded: number | null;
}

export interface ScoreComponent {
  count: number | null;
  normalized: number | null;
  contribution: number;
  weight: number;
}

export interface DemandScore {
  version: typeof acquisitionScoreVersion;
  bookId: string;
  branchId: string;
  window: DemandWindow;
  score: number;
  confidence: number;
  band: 'LOW' | 'MEDIUM' | 'HIGH';
  components: {
    waitingHolds: ScoreComponent;
    loansStarted: ScoreComponent;
    favoritesAdded: ScoreComponent;
  };
  omittedSignals: readonly ['ZERO_RESULT_SEARCH', 'UNAVAILABLE_VIEW', 'OPEN_ORDER', 'BUDGET'];
  manualReviewRequired: true;
  purchaseDecisionAllowed: false;
}

const weights = { waitingHolds: 0.5, loansStarted: 0.35, favoritesAdded: 0.15 } as const;
const omittedSignals = ['ZERO_RESULT_SEARCH', 'UNAVAILABLE_VIEW', 'OPEN_ORDER', 'BUDGET'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function count(value: number | null, field: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000))
    throw new Error(`${field} phải là số đếm hợp lệ.`);
}

function instant(value: string, field: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value))
    throw new Error(`${field} phải là thời điểm UTC.`);
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19))
    throw new Error(`${field} không hợp lệ.`);
  return time;
}

function component(value: number | null, denominator: number, weight: number): ScoreComponent {
  if (value === null) return { count: null, normalized: null, contribution: 0, weight };
  const normalized = Math.min(1, value / denominator);
  return { count: value, normalized, contribution: Math.round(normalized * weight * 1000) / 10, weight };
}

export function scoreDemand(facts: DemandFacts): DemandScore {
  if (!uuid.test(facts.bookId) || !uuid.test(facts.branchId)) throw new Error('Book hoặc chi nhánh không hợp lệ.');
  const from = instant(facts.window.from, 'from');
  const to = instant(facts.window.to, 'to');
  const asOf = instant(facts.window.asOf, 'asOf');
  if (to <= from || to - from > 366 * 86_400_000 || asOf < to)
    throw new Error('Khoảng thời gian hoặc thời điểm chốt dữ liệu không hợp lệ.');
  if (facts.copiesOwned === null || facts.copiesAvailable === null)
    throw new Error('Thiếu số liệu bản sách tại thời điểm chốt.');
  count(facts.copiesOwned, 'copiesOwned');
  count(facts.copiesAvailable, 'copiesAvailable');
  count(facts.waitingHolds, 'waitingHolds');
  count(facts.loansStarted, 'loansStarted');
  count(facts.favoritesAdded, 'favoritesAdded');
  if (facts.copiesAvailable > facts.copiesOwned) throw new Error('Số bản sẵn có vượt tổng số bản.');

  const copies = Math.max(1, facts.copiesOwned);
  const days = (to - from) / 86_400_000;
  const components = {
    waitingHolds: component(facts.waitingHolds, copies, weights.waitingHolds),
    loansStarted: component(facts.loansStarted, copies * Math.max(1, days / 30) * 4, weights.loansStarted),
    favoritesAdded: component(facts.favoritesAdded, copies * 4, weights.favoritesAdded),
  };
  const score = Math.round(Object.values(components).reduce((sum, item) => sum + item.contribution, 0) * 10) / 10;
  const confidence = Math.round(Object.values(components).reduce((sum, item) =>
    sum + (item.count === null ? 0 : item.weight), 0) * 100) / 100;
  return {
    version: acquisitionScoreVersion,
    bookId: facts.bookId,
    branchId: facts.branchId,
    window: facts.window,
    score,
    confidence,
    band: score >= 60 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW',
    components,
    omittedSignals,
    manualReviewRequired: true,
    purchaseDecisionAllowed: false,
  };
}
