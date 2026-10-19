import { ArrowRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ReaderHomePage() {
  return (
    <div className="shell py-12 md:py-20">
      <section className="grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <div><p className="eyebrow">Thư viện của bạn</p><h1 className="editorial-title mt-3 text-ink">Mỗi cuốn sách mở ra một góc nhìn.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted">Tra cứu tác phẩm, tìm sách theo tác giả hoặc thể loại và xem thông tin từng ấn bản trong thư viện.</p><div className="mt-8 flex flex-wrap gap-3"><Link className="button-primary" to="/sach"><Search size={17} /> Khám phá danh mục</Link><Link className="button-secondary" to="/dang-nhap">Đăng nhập <ArrowRight size={17} /></Link></div></div>
        <div className="editorial-card"><p className="eyebrow">Danh mục sách</p><div className="empty-state"><Search size={28} /><h2>Tìm tác phẩm bạn quan tâm</h2><p>Đăng nhập để tra cứu dữ liệu thư viện. Thông tin tác phẩm và ấn bản do nhân viên cập nhật.</p></div></div>
      </section>
    </div>
  );
}
