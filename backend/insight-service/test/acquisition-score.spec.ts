import { scoreDemand, type DemandFacts } from '../src/acquisition/acquisition-score';

const facts: DemandFacts = {
  bookId: '11111111-1111-4111-8111-111111111111',
  branchId: '22222222-2222-4222-8222-222222222222',
  window: { from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z', asOf: '2026-10-01T00:00:00Z' },
  copiesOwned: 2,
  copiesAvailable: 0,
  waitingHolds: 2,
  loansStarted: 8,
  favoritesAdded: 8,
};

describe('acquisition score', () => {
  it('giữ từng thành phần, cửa sổ và phiên bản để nhân viên đối chiếu', () => {
    const result = scoreDemand(facts);
    expect(result).toMatchObject({
      score: 100, confidence: 1, band: 'HIGH', manualReviewRequired: true, purchaseDecisionAllowed: false,
      version: 'acquisition-v1', bookId: facts.bookId, branchId: facts.branchId,
      components: {
        waitingHolds: { count: 2, normalized: 1, contribution: 50 },
        loansStarted: { count: 8, normalized: 1, contribution: 35 },
        favoritesAdded: { count: 8, normalized: 1, contribution: 15 },
      },
    });
    expect(result.omittedSignals).toEqual(['ZERO_RESULT_SEARCH', 'UNAVAILABLE_VIEW', 'OPEN_ORDER', 'BUDGET']);
    expect(scoreDemand(facts)).toEqual(result);
  });

  it('không bù điểm cho tín hiệu chưa có và chặn ngoại lệ đếm quá mức', () => {
    const result = scoreDemand({ ...facts, waitingHolds: 1, loansStarted: null, favoritesAdded: null });
    expect(result.score).toBe(25);
    expect(result.confidence).toBe(0.5);
    expect(result.band).toBe('MEDIUM');
    expect(result.components.loansStarted).toMatchObject({ count: null, contribution: 0 });
    expect(scoreDemand({ ...facts, waitingHolds: 1_000_000, loansStarted: 1_000_000, favoritesAdded: 1_000_000 }).score)
      .toBe(100);
  });

  it('từ chối dữ liệu thời gian, số bản và số đếm không nhất quán', () => {
    expect(() => scoreDemand({ ...facts, copiesAvailable: 3 })).toThrow('vượt tổng');
    expect(() => scoreDemand({ ...facts, waitingHolds: -1 })).toThrow('số đếm');
    expect(() => scoreDemand({ ...facts, loansStarted: 1.5 })).toThrow('số đếm');
    expect(() => scoreDemand({ ...facts, bookId: 'book' })).toThrow('không hợp lệ');
    expect(() => scoreDemand({ ...facts, window: { ...facts.window, to: facts.window.from } })).toThrow('Khoảng thời gian');
    expect(() => scoreDemand({ ...facts, window: { ...facts.window, asOf: '2026-09-30T00:00:00Z' } }))
      .toThrow('Khoảng thời gian');
    expect(() => scoreDemand({ ...facts, window: { ...facts.window, from: '2026-02-30T00:00:00Z' } }))
      .toThrow('không hợp lệ');
  });
});
