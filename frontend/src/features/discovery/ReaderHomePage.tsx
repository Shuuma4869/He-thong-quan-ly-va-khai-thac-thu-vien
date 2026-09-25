import { ArrowRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ReaderHomePage() {
  return (
    <div className="shell py-12 md:py-20">
      <section className="grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <div><p className="eyebrow">Thư viện của bạn</p><h1 className="editorial-title mt-3 text-ink">Tìm tài liệu và theo dõi việc mượn sách trong một nơi.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted">LAMS đang ở giai đoạn xây dựng nền tảng. Dữ liệu danh mục sẽ xuất hiện sau khi thủ thư thêm vào hệ thống.</p><div className="mt-8 flex flex-wrap gap-3"><button className="button-primary"><Search size={17} /> Khám phá danh mục</button><Link className="button-secondary" to="/dang-nhap">Đăng nhập <ArrowRight size={17} /></Link></div></div>
        <div className="editorial-card"><p className="eyebrow">Danh mục sách</p><div className="empty-state"><Search size={28} /><h2>Chưa có dữ liệu sách.</h2><p>Kho sách sẽ hiển thị tại đây sau khi dữ liệu được thêm vào hệ thống.</p></div></div>
      </section>
    </div>
  );
}
