import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { UnsavedChangesProvider } from './UnsavedChangesProvider';
import { useUnsavedChanges } from './unsaved-changes';

function Form() {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  useUnsavedChanges({ dirty: value !== saved, busy, uncertain, label: 'Bản nháp kiểm thử' });
  return <><input aria-label="Nội dung" value={value} onChange={event => setValue(event.target.value)}/>
    <Link to="/next">Trang khác</Link><button onClick={() => setSaved(value)}>Lưu thành công</button>
    <button onClick={() => setBusy(true)}>Gửi chậm</button>
    <button onClick={() => { setBusy(false); setUncertain(true); }}>Mất kết nối</button></>;
}
function setup() {
  const router = createMemoryRouter([{ element: <UnsavedChangesProvider><Outlet/></UnsavedChangesProvider>, children: [
    { path: '/form', element: <Form/> }, { path: '/next', element: <h1>Trang tiếp theo</h1> },
  ] }], { initialEntries: ['/next', '/form'], initialIndex: 1 });
  render(<RouterProvider router={router}/>);
  return router;
}
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, writable: true, value() {} });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => vi.restoreAllMocks());
it('link nội bộ giữ bản nháp khi ở lại và chỉ bỏ sau khi xác nhận', async () => {
  const router = setup();
  fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'Chưa lưu' } });
  fireEvent.click(screen.getByText('Trang khác'));
  const dialog = await screen.findByRole('dialog');
  expect(router.state.location.pathname).toBe('/form');
  fireEvent.click(within(dialog).getByText('Tiếp tục chỉnh sửa'));
  expect(screen.getByLabelText('Nội dung')).toHaveValue('Chưa lưu');
  fireEvent.click(screen.getByText('Trang khác'));
  fireEvent.click(within(await screen.findByRole('dialog')).getByText('Bỏ thay đổi và rời trang'));
  expect(await screen.findByRole('heading')).toHaveTextContent('Trang tiếp theo');
});
it('Back bị chặn, ở lại giữ vị trí lịch sử; xác nhận rồi Forward trở lại được', async () => {
  const router = setup();
  fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'Chưa lưu' } });
  await act(async () => { await router.navigate(-1); });
  fireEvent.click(within(await screen.findByRole('dialog')).getByText('Tiếp tục chỉnh sửa'));
  expect(router.state.location.pathname).toBe('/form');
  await act(async () => { await router.navigate(-1); });
  fireEvent.click(within(await screen.findByRole('dialog')).getByText('Bỏ thay đổi và rời trang'));
  await screen.findByRole('heading');
  await act(async () => { await router.navigate(1); });
  expect(screen.getByLabelText('Nội dung')).toHaveValue('');
});
it('form sạch và form đã lưu không cảnh báo khi chuyển trang', async () => {
  const router = setup();
  fireEvent.click(screen.getByText('Trang khác'));
  await screen.findByRole('heading');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => { await router.navigate('/form'); });
  fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'Đã lưu' } });
  fireEvent.click(screen.getByText('Lưu thành công'));
  fireEvent.click(screen.getByText('Trang khác'));
  expect(await screen.findByRole('heading')).toHaveTextContent('Trang tiếp theo');
});
it('đang gửi không cho bỏ; kết quả không rõ được cảnh báo, không báo giao dịch bị hủy', async () => {
  setup(); fireEvent.click(screen.getByText('Gửi chậm')); fireEvent.click(screen.getByText('Trang khác'));
  expect(within(await screen.findByRole('dialog')).getByText('Bỏ thay đổi và rời trang')).toBeDisabled();
  fireEvent.click(screen.getByText('Tiếp tục chỉnh sửa')); fireEvent.click(screen.getByText('Mất kết nối'));
  fireEvent.click(screen.getByText('Trang khác'));
  expect(await screen.findByText(/Rời trang không hủy giao dịch/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Rời trang và kiểm tra lại sau'));
  await screen.findByRole('heading');
});
