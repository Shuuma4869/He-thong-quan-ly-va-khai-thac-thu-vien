import { scoreDemand, type DemandFacts, type DemandWindow } from './acquisition-score';

export const acquisitionSourceVersion = 'acquisition-source-v1';

export type SignalBasis = 'CURRENT_STATE' | 'WINDOWED_ROWS' | 'EVENT_ADDS';

export type CountSignal =
  | { count: number; basis: SignalBasis; source: string; unavailableReason: null }
  | { count: null; basis: null; source: null; unavailableReason: string };

export interface AcquisitionScope {
  bookId: string;
  branchId: string;
  from: string;
  to: string;
}

export interface AcquisitionSourceSnapshot {
  contractVersion: typeof acquisitionSourceVersion;
  sourceRevision: string;
  bookId: string;
  branchId: string;
  window: DemandWindow;
  copiesOwned: number;
  copiesAvailable: number;
  waitingHolds: CountSignal;
  loansStarted: CountSignal;
  favoritesAdded: CountSignal;
}

/** Chỉ nhận dữ liệu từ read projection Core được bảo vệ; không đọc database Core trực tiếp. */
export interface AcquisitionFactsPort {
  load(scope: AcquisitionScope, authorization: string): Promise<AcquisitionSourceSnapshot>;
}

function signal(value: CountSignal, basis: SignalBasis, name: string): number | null {
  if (value.count === null) {
    if (value.basis !== null || value.source !== null || !value.unavailableReason?.trim())
      throw new Error(`${name}: thiếu lý do khi tín hiệu chưa có.`);
    return null;
  }
  if (!Number.isSafeInteger(value.count) || value.count < 0 || value.basis !== basis
      || !value.source?.trim() || value.unavailableReason !== null)
    throw new Error(`${name}: số liệu hoặc nguồn không đúng hợp đồng.`);
  return value.count;
}

export function demandFactsFromSource(scope: AcquisitionScope, snapshot: AcquisitionSourceSnapshot): DemandFacts {
  if (snapshot.contractVersion !== acquisitionSourceVersion || !snapshot.sourceRevision?.trim())
    throw new Error('Phiên bản nguồn Acquisition không hợp lệ.');
  if (snapshot.bookId !== scope.bookId || snapshot.branchId !== scope.branchId
      || snapshot.window.from !== scope.from || snapshot.window.to !== scope.to)
    throw new Error('Phạm vi dữ liệu Acquisition không khớp yêu cầu.');
  const facts: DemandFacts = {
    bookId: snapshot.bookId,
    branchId: snapshot.branchId,
    window: snapshot.window,
    copiesOwned: snapshot.copiesOwned,
    copiesAvailable: snapshot.copiesAvailable,
    waitingHolds: signal(snapshot.waitingHolds, 'CURRENT_STATE', 'waitingHolds'),
    loansStarted: signal(snapshot.loansStarted, 'WINDOWED_ROWS', 'loansStarted'),
    favoritesAdded: signal(snapshot.favoritesAdded, 'EVENT_ADDS', 'favoritesAdded'),
  };
  scoreDemand(facts);
  return facts;
}
