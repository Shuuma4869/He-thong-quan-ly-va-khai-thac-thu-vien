import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-center"><div><p className="eyebrow">Lỗi 404</p><h1 className="page-title mt-2">Không tìm thấy trang</h1><p className="mt-3 text-muted">Đường dẫn này không tồn tại hoặc đã được thay đổi.</p><Link className="button-primary mt-7" to="/"><ArrowLeft size={17} /> Về trang chủ</Link></div></main>;
}
