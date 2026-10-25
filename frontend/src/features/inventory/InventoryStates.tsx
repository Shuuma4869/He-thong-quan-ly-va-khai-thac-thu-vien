import { ApiError } from '../../shared/api/client';
import type { InventoryPage } from './inventory-api';

export function InventoryError({ error, reload }: { error: Error; reload?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  const message = status === 401 ? 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.'
    : status === 403 ? 'Tài khoản không còn quyền kiểm kê.'
    : status >= 400 && status < 500 ? error.message
    : 'Chưa xác định được kết quả. Kiểm tra phiên kiểm kê trước khi gửi yêu cầu khác.';
  return <div className="editorial-card my-3" role="alert"><p>{message}</p>
    {reload && status !== 401 && status !== 403 && <button type="button" className="button-secondary mt-3" onClick={reload}>Tải lại</button>}</div>;
}
export function InventoryPagination({ page, onChange }: { page: InventoryPage<unknown>['page']; onChange: (page: number) => void }) {
  return <nav className="inventory-pagination my-4 flex flex-wrap items-center gap-2" aria-label="Phân trang kiểm kê">
    <button type="button" className="button-secondary" disabled={page.page === 0} onClick={() => onChange(page.page - 1)}>Trang trước</button>
    <span>Trang {page.page + 1}/{Math.max(1, page.totalPages)} · {page.totalElements} mục</span>
    <button type="button" className="button-secondary" disabled={page.page + 1 >= page.totalPages} onClick={() => onChange(page.page + 1)}>Trang sau</button>
  </nav>;
}
