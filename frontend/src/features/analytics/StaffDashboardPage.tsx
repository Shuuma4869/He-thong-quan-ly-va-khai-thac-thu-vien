import { Activity, Boxes, CircleAlert } from 'lucide-react';

export function StaffDashboardPage() {
  return (
    <div><p className="eyebrow">Nhân viên thư viện</p><h1 className="page-title">Bảng điều khiển</h1><p className="mt-2 text-muted">Theo dõi nhanh trạng thái vận hành của thư viện.</p><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><article className="metric-card"><Activity /><span>Trạng thái hệ thống</span><strong>Sẵn sàng cấu hình</strong></article><article className="metric-card"><Boxes /><span>Dữ liệu bản sách</span><strong>Chưa có dữ liệu</strong></article><article className="metric-card"><CircleAlert /><span>Bất thường kiểm kê</span><strong>Chưa có dữ liệu</strong></article></div><section className="editorial-card mt-6"><h2 className="section-title">Hoạt động gần đây</h2><div className="empty-state compact"><p>Chưa có hoạt động nghiệp vụ. Dữ liệu sẽ xuất hiện sau khi các module được triển khai.</p></div></section></div>
  );
}
