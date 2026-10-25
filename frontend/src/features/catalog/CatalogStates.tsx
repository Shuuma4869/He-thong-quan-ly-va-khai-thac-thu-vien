import { ApiError } from '../../shared/api/client';
import type { Page } from './catalog-api';

export function CatalogError({ error, retry }: { error: Error; retry: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const missing = error instanceof ApiError && error.status === 404;
  return <div role="alert" className="editorial-card my-5">
    <h2 className="section-title">{forbidden ? 'Bạn không có quyền truy cập' : missing ? 'Không tìm thấy dữ liệu' : 'Không tải được dữ liệu'}</h2>
    <p className="my-3">{error instanceof ApiError && error.status < 500 ? error.message : 'Không tải được dữ liệu. Vui lòng thử lại.'}</p>
    {!forbidden && !missing && <button className="button-secondary" onClick={retry}>Thử lại</button>}
  </div>;
}
export function Pagination({ page, onChange }: { page: Page; onChange: (page: number) => void }) {
  return <nav className="my-5 flex flex-wrap items-center gap-3" aria-label="Phân trang">
    <button type="button" className="button-secondary" disabled={page.number === 0} onClick={() => onChange(page.number - 1)}>Trang trước</button>
    <span>Trang {page.number + 1} / {Math.max(1, page.totalPages)} · {page.totalElements} kết quả</span>
    <button type="button" className="button-secondary" disabled={page.number + 1 >= page.totalPages} onClick={() => onChange(page.number + 1)}>Trang sau</button>
    {page.number > 0 && page.totalElements === 0 && <button type="button" className="button-secondary" onClick={() => onChange(0)}>Về trang đầu</button>}
  </nav>;
}
