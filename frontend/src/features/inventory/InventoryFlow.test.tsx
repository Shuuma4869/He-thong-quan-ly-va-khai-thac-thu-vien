import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../../app/providers/AppProviders';
import { AppRouter } from '../../app/router/AppRouter';
import type { InventorySession } from './inventory-api';

const staffId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const shelfId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const scanId = '55555555-5555-4555-8555-555555555555';
const anomalyId = '66666666-6666-4666-8666-666666666666';
const observedShelf = '77777777-7777-4777-8777-777777777777';
const time = '2026-10-25T00:00:00Z';
const identity = { accessToken: 'test-only', accessTokenExpiresAt: '2030-01-01T00:00:00Z',
  user: { id: staffId, memberCode: 'TT1', email: 'staff@example.test', fullName: 'Thủ thư', roles: ['LIBRARIAN'] } };
const initialSession: InventorySession = { id: sessionId, branchId, shelfId, openedBy: staffId, openedAt: time,
  status: 'OPEN', version: 0, snapshotCount: 1, scanCount: 0, closedAt: null, closedBy: null, closeReason: null };
const page = (items: unknown[]) => ({ items, page: { page: 0, size: 20, totalElements: items.length, totalPages: items.length ? 1 : 0 } });
let session = { ...initialSession };
let anomalies: unknown[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
let role = 'LIBRARIAN';
const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
function app(path = `/nhan-vien/kiem-ke/${sessionId}`) {
  return render(<AppProviders><MemoryRouter initialEntries={[path]}><AppRouter/></MemoryRouter></AppProviders>);
}
function response(url: string, init: RequestInit) {
  const path = new URL(url).pathname;
  if (path.endsWith('/auth/refresh')) return Response.json({ ...identity, user: { ...identity.user, roles: [role] } });
  if (path.endsWith(`/inventory-sessions/${sessionId}/scans`) && init.method === 'POST') {
    session = { ...session, scanCount: session.scanCount + 1, version: session.version + 1 };
    const body = JSON.parse(init.body as string);
    return Response.json({ id: scanId, sessionId, clientScanId: body.clientScanId, barcode: body.barcode,
      branchId, shelfId, scannedBy: staffId, receivedAt: time, clientScannedAt: null, sessionVersion: session.version }, { status: 201 });
  }
  if (path.endsWith(`/inventory-sessions/${sessionId}/finalize`) && init.method === 'POST') {
    session = { ...session, status: 'FINALIZED', version: session.version + 1, closedAt: time, closedBy: staffId };
    return Response.json(session);
  }
  if (path.endsWith(`/inventory-sessions/${sessionId}/anomalies/${anomalyId}/resolution`) && init.method === 'POST') {
    const resolution = { id: scanId, anomalyId, action: 'MOVE_TO_SCANNED_SHELF', reason: 'Đã kiểm tra kệ thực tế',
      copyVersionSeen: 0, copyVersionAfter: 1, resolvedBy: staffId, resolvedAt: time };
    anomalies = anomalies.map(value => ({ ...(value as object), resolution }));
    return Response.json(resolution, { status: 201 });
  }
  if (path.endsWith(`/inventory-sessions/${sessionId}`)) return Response.json(session);
  if (path.endsWith('/inventory-sessions')) return Response.json(page([session]));
  if (path.endsWith('/snapshot')) return Response.json(page([{ id: scanId, barcode: 'BC1', branchId, shelfId,
    status: 'AVAILABLE', version: 0 }]));
  if (path.endsWith('/anomalies')) return Response.json(page(anomalies));
  if (path.endsWith('/scans')) return Response.json(page([]));
  if (path.endsWith(`/copies/${scanId}`)) return Response.json({ id: scanId, editionId: staffId,
    bookTitle: 'Sách kiểm kê', isbn13: null, shelfId, shelfCode: 'K1', branchId, barcode: 'BC1', status: 'AVAILABLE', version: 0 });
  if (path.endsWith(`/branches/${branchId}`)) return Response.json({ id: branchId, code: 'A', name: 'Chi nhánh A', status: 'ACTIVE' });
  if (path.endsWith(`/shelves/${shelfId}`)) return Response.json({ id: shelfId, branchId, branchCode: 'A', code: 'K1', label: 'Kệ 1', sortOrder: 0 });
  if (path.endsWith('/branches')) return Response.json({ items: [{ id: branchId, code: 'A', name: 'Chi nhánh A', status: 'ACTIVE' }],
    page: { number: 0, size: 20, totalElements: 1, totalPages: 1 } });
  return Response.json(page([]));
}
beforeEach(() => {
  session = { ...initialSession }; anomalies = []; role = 'LIBRARIAN';
  fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(response(url, init)));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (mediaDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDescriptor);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor);
  else Reflect.deleteProperty(navigator, 'onLine');
});

it('camera không hỗ trợ vẫn giữ ô nhập mã thủ công', async () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  app(); await screen.findByText(/1 bản trong snapshot/);
  fireEvent.click(screen.getByRole('button', { name: 'Quét bằng camera' }));
  expect(await screen.findByText(/chưa hỗ trợ quét mã vạch/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Mã vạch'), { target: { value: 'BC1' } });
  expect(screen.getByRole('button', { name: 'Ghi nhận scan' })).toBeEnabled();
});

it('camera giả lập chỉ điền mã, nhân viên xác nhận trước khi gửi scan', async () => {
  const stop = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
  vi.stubGlobal('BarcodeDetector', class { detect = vi.fn().mockResolvedValue([{ rawValue: 'BC1' }]); });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  app(); await screen.findByText(/1 bản trong snapshot/);
  fireEvent.click(screen.getByRole('button', { name: 'Quét bằng camera' }));
  await waitFor(() => expect(screen.getByLabelText('Mã vạch')).toHaveValue('BC1'));
  expect(stop).toHaveBeenCalled();
  expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/scans') && init.method === 'POST')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận scan' }));
  expect(await screen.findByText(/Đã nhận: BC1/)).toBeInTheDocument();
});

it('mã lưu tạm khi mất mạng khóa chốt và retry cùng clientScanId sau khi online', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  let first = true;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith(`/inventory-sessions/${sessionId}/scans`) && init.method === 'POST' && first) {
      first = false; return Promise.reject(new TypeError('network'));
    }
    return Promise.resolve(response(url, init));
  });
  app(); await screen.findByText(/1 bản trong snapshot/);
  fireEvent.change(screen.getByLabelText('Mã vạch'), { target: { value: 'BC1' } });
  expect(screen.getByRole('button', { name: 'Ghi nhận scan' })).toBeDisabled();
  expect(screen.getByText(/Đang offline\. Lưu mã tạm thời/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mã tạm thời' }));
  expect(await screen.findByText(/1 mã đang chờ/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Chốt phiên' })).toBeDisabled();
  expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/scans') && init.method === 'POST')).toHaveLength(0);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new Event('online'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Kiểm tra và đồng bộ' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và đồng bộ' }));
  expect(await screen.findByText(/Chưa nhận được biên nhận cho mã đầu/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và đồng bộ' }));
  expect(await screen.findByText(/Đã đồng bộ hết/)).toBeInTheDocument();
  const calls = fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/scans') && init.method === 'POST');
  expect(calls).toHaveLength(2);
  expect(calls[0][1].body).toBe(calls[1][1].body);
  expect(screen.queryByRole('region', { name: 'Mã chờ đồng bộ' })).not.toBeInTheDocument();
});

it('phiên đổi version trước đồng bộ phải được nhân viên xác nhận', async () => {
  app(); await screen.findByText(/1 bản trong snapshot/);
  fireEvent.change(screen.getByLabelText('Mã vạch'), { target: { value: 'BC1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mã tạm thời' }));
  session = { ...session, version: 1 };
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và đồng bộ' }));
  expect(await screen.findByText(/Phiên đã có thay đổi/)).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/scans') && init.method === 'POST')).toHaveLength(0);
  fireEvent.click(screen.getByLabelText(/Tôi đã xem lại phiên/));
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và đồng bộ' }));
  expect(await screen.findByText(/Đã đồng bộ hết/)).toBeInTheDocument();
});

it('scan giữ cùng clientScanId khi mất phản hồi rồi chốt đúng version', async () => {
  let first = true;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith(`/inventory-sessions/${sessionId}/scans`) && init.method === 'POST' && first) {
      first = false; return Promise.reject(new TypeError('network'));
    }
    return Promise.resolve(response(url, init));
  });
  app(); await screen.findByText(/1 bản trong snapshot/);
  fireEvent.change(screen.getByLabelText('Mã vạch'), { target: { value: 'BC1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận scan' }));
  const retry = await screen.findByRole('button', { name: 'Thử lại scan đang chờ' });
  expect(screen.getByLabelText('Mã vạch')).toBeDisabled();
  expect(screen.getByText(/Scan còn chờ biên nhận/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Chốt phiên' })).toBeDisabled();
  fireEvent.click(retry);
  await screen.findByText(/Đã nhận: BC1/);
  expect(screen.queryByText(/Scan còn chờ biên nhận/)).not.toBeInTheDocument();
  const scans = fetchMock.mock.calls.filter(([url, init]) => url.endsWith(`/inventory-sessions/${sessionId}/scans`) && init.method === 'POST');
  expect(scans).toHaveLength(2);
  expect(scans[0][1].body).toBe(scans[1][1].body);
  await screen.findByText(/1 lượt quét/);
  fireEvent.click(screen.getByLabelText(/Đã kiểm tra các lượt quét/));
  fireEvent.click(screen.getByRole('button', { name: 'Chốt phiên' }));
  await screen.findByRole('heading', { name: 'Bằng chứng cần rà soát' });
  const close = fetchMock.mock.calls.find(([url, init]) => url.endsWith('/finalize') && init.method === 'POST');
  expect(JSON.parse(close![1].body)).toMatchObject({ version: 1 });
  expect(screen.queryByRole('button', { name: 'Ghi nhận scan' })).not.toBeInTheDocument();
});

it('Reader không tải API kiểm kê', async () => {
  role = 'READER'; app('/nhan-vien/kiem-ke');
  await screen.findByRole('heading', { name: '403 · Không có quyền truy cập' });
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/inventory-sessions'))).toBe(false);
});

it('mở danh sách có phiên thật và điều hướng vào chi tiết', async () => {
  app('/nhan-vien/kiem-ke');
  expect(await screen.findByRole('link', { name: 'Mở phiên →' })).toHaveAttribute('href', `/nhan-vien/kiem-ke/${sessionId}`);
  await waitFor(() => expect(screen.getByText(/1 bản chụp/)).toBeInTheDocument());
});

it('chỉ chuyển kệ sau xác nhận và gửi version Copy hiện tại', async () => {
  session = { ...initialSession, status: 'FINALIZED', closedAt: time, closedBy: staffId };
  const current = { id: scanId, barcode: 'BC1', branchId, shelfId, status: 'AVAILABLE', version: 0 };
  anomalies = [{ id: anomalyId, kind: 'WRONG_SHELF', copyId: scanId, detectedAt: time, resolution: null,
    evidence: { id: anomalyId, kind: 'WRONG_SHELF', sessionId, copyId: scanId,
      scan: { id: scanId, barcode: 'BC1', branchId, shelfId: observedShelf, scannedAt: time, actorId: staffId },
      snapshot: current, current, firstScanId: null } }];
  app(); await screen.findByRole('heading', { name: 'Sai kệ' });
  await screen.findByText(/Bản hiện tại:/);
  fireEvent.change(screen.getByLabelText('Cách xử lý'), { target: { value: 'MOVE_TO_SCANNED_SHELF' } });
  fireEvent.change(screen.getByLabelText('Lý do và kết quả kiểm tra'), { target: { value: 'Đã kiểm tra kệ thực tế' } });
  const save = screen.getByRole('button', { name: 'Lưu kết quả rà soát' });
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Tôi đã kiểm tra bản sách hiện tại và xác nhận quyết định này.'));
  fireEvent.click(save);
  await screen.findByText(/Đã chuyển về kệ quét/);
  const command = fetchMock.mock.calls.find(([url, init]) => url.endsWith('/resolution') && init.method === 'POST');
  expect(JSON.parse(command![1].body)).toMatchObject({ action: 'MOVE_TO_SCANNED_SHELF', expectedCopyVersion: 0 });
});
