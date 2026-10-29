import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();
  return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-center"><div><p className="eyebrow">Lỗi 404</p><h1 className="page-title mt-2">Không tìm thấy trang</h1><p className="mt-3 text-muted">Đường dẫn này không tồn tại hoặc đã được thay đổi.</p><div className="flex flex-wrap justify-center gap-3 mt-7"><button className="button-primary" onClick={() => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/sach', { replace: true }); }}><ArrowLeft size={17}/> Quay lại</button><Link className="button-secondary" to="/">Về trang chủ</Link></div></div></main>;
}
