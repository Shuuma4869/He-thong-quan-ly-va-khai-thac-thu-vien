import { scoreDemand } from '../src/acquisition/acquisition-score';
import { acquisitionSourceVersion, demandFactsFromSource,
  type AcquisitionScope, type AcquisitionSourceSnapshot } from '../src/acquisition/acquisition-source';

const scope: AcquisitionScope = {
  bookId: '11111111-1111-4111-8111-111111111111',
  branchId: '22222222-2222-4222-8222-222222222222',
  from: '2026-09-01T00:00:00Z',
  to: '2026-10-01T00:00:00Z',
};
const snapshot: AcquisitionSourceSnapshot = {
  contractVersion: acquisitionSourceVersion,
  sourceRevision: 'core-read-v1',
  bookId: scope.bookId,
  branchId: scope.branchId,
  window: { from: scope.from, to: scope.to, asOf: '2026-10-01T00:00:00Z' },
  copiesOwned: 2,
  copiesAvailable: 1,
  waitingHolds: { count: 1, basis: 'CURRENT_STATE', source: 'holds', unavailableReason: null },
  loansStarted: { count: 2, basis: 'WINDOWED_ROWS', source: 'loans', unavailableReason: null },
  favoritesAdded: { count: null, basis: null, source: null,
    unavailableReason: 'favorites hiện tại không giữ lịch sử lượt thêm đã bị xóa' },
};

describe('Acquisition source contract', () => {
  it('giữ null cho tín hiệu không có lịch sử và giảm confidence', () => {
    const facts = demandFactsFromSource(scope, snapshot);
    expect(facts.favoritesAdded).toBeNull();
    expect(scoreDemand(facts).confidence).toBe(0.85);
  });

  it('không nhận số favorite hiện tại làm lượt thêm trong cửa sổ', () => {
    expect(() => demandFactsFromSource(scope, { ...snapshot,
      favoritesAdded: { count: 2, basis: 'CURRENT_STATE', source: 'favorites', unavailableReason: null },
    })).toThrow('favoritesAdded');
  });

  it('từ chối sai Book, chi nhánh, cửa sổ và thiếu nguồn', () => {
    expect(() => demandFactsFromSource({ ...scope, branchId: '33333333-3333-4333-8333-333333333333' }, snapshot))
      .toThrow('không khớp');
    expect(() => demandFactsFromSource(scope, { ...snapshot, window: { ...snapshot.window,
      to: '2026-10-02T00:00:00Z' } })).toThrow('không khớp');
    expect(() => demandFactsFromSource(scope, { ...snapshot, sourceRevision: '' })).toThrow('Phiên bản nguồn');
    expect(() => demandFactsFromSource(scope, { ...snapshot,
      loansStarted: { count: 2, basis: 'WINDOWED_ROWS', source: '', unavailableReason: null },
    })).toThrow('loansStarted');
  });

  it('từ chối null không lý do và số bản không nhất quán', () => {
    expect(() => demandFactsFromSource(scope, { ...snapshot,
      waitingHolds: { count: null, basis: null, source: null, unavailableReason: '' },
    })).toThrow('waitingHolds');
    expect(() => demandFactsFromSource(scope, { ...snapshot, copiesAvailable: 3 })).toThrow('vượt tổng');
  });
});
