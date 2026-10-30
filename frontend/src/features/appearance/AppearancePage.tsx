import { useEffect, useState } from 'react';
import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { useAppearance } from './appearance-context';
import type { Appearance } from './appearance';

const fields: { key: Exclude<keyof Appearance, 'widgets'>; label: string; options: [string, string][] }[] = [
  { key: 'accent', label: 'Màu nhấn', options: [['blue', 'Xanh dương'], ['teal', 'Xanh ngọc'], ['sky', 'Xanh trời'], ['emerald', 'Lục bảo'], ['sand', 'Cát ấm']] },
  { key: 'glass', label: 'Độ trong của bề mặt', options: [['subtle', 'Nhẹ'], ['standard', 'Vừa'], ['strong', 'Rõ']] },
  { key: 'blur', label: 'Làm mờ nền', options: [['on', 'Bật'], ['off', 'Tắt']] },
  { key: 'sidebarStyle', label: 'Thanh điều hướng', options: [['floating', 'Nổi'], ['classic', 'Cổ điển']] },
  { key: 'sidebarState', label: 'Kích thước thanh điều hướng', options: [['expanded', 'Mở rộng'], ['collapsed', 'Thu gọn']] },
  { key: 'density', label: 'Mật độ hiển thị', options: [['comfortable', 'Thoải mái'], ['compact', 'Gọn']] },
  { key: 'radius', label: 'Bo góc', options: [['medium', 'Vừa'], ['soft', 'Mềm'], ['large', 'Lớn']] },
  { key: 'fontSize', label: 'Kích thước chữ', options: [['standard', 'Tiêu chuẩn'], ['large', 'Lớn hơn']] },
  { key: 'motion', label: 'Chuyển động', options: [['normal', 'Bình thường'], ['reduced', 'Giảm'], ['off', 'Tắt']] },
  { key: 'bookView', label: 'Hiển thị sách', options: [['grid', 'Lưới'], ['list', 'Danh sách']] },
];
const widgetLabels: Record<string, string> = { overview: 'Tổng quan', circulation: 'Lưu thông',
  inventory: 'Kiểm kê', acquisition: 'Bổ sung sách' };

export function AppearancePage() {
  const appearance = useAppearance();
  const { user } = useAuth();
  const draft = appearance.values;
  const dirty = JSON.stringify(draft) !== JSON.stringify(appearance.saved);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = <K extends Exclude<keyof Appearance, 'widgets'>>(key: K, value: Appearance[K]) => {
    const next = { ...draft, [key]: value };
    appearance.preview(next); setNotice('');
  };
  const save = async (next = draft) => {
    try { await appearance.save(next); setNotice('Đã lưu thiết lập giao diện.'); }
    catch { setNotice('Chưa lưu được thiết lập. Xem thông báo lỗi bên dưới.'); }
  };
  const toggleWidget = (widget: string) => {
    const next = { ...draft, widgets: draft.widgets.includes(widget)
      ? draft.widgets.filter(item => item !== widget) : [...draft.widgets, widget] };
    appearance.preview(next); setNotice('');
  };
  return <section className="shell library-page appearance-page" aria-labelledby="appearance-title">
    <header className="appearance-hero"><span className="appearance-hero-icon"><SlidersHorizontal size={26}/></span>
      <div><p className="eyebrow">Không gian của bạn</p><h1 id="appearance-title" className="page-title">Tùy chỉnh giao diện</h1>
      <p>Thử các lựa chọn ngay trên trang. Lưu khi bạn thấy vừa ý.</p></div></header>
    <div className="appearance-layout"><div className="appearance-controls">
      {fields.map((field, index) => <fieldset disabled={appearance.saving || appearance.loading} className="appearance-field" key={field.key}><legend>{field.label}</legend>
        {[0, 3, 7].includes(index) && <p className="appearance-group-label">{index === 0 ? 'Màu sắc & bề mặt' : index === 3 ? 'Bố cục & khoảng cách' : 'Đọc & chuyển động'}</p>}
        <div className="appearance-options">{field.options.map(([value, label]) => <button key={value} type="button"
          className={draft[field.key] === value ? 'is-selected' : ''} aria-pressed={draft[field.key] === value}
          onClick={() => change(field.key, value as never)}>{draft[field.key] === value && <Check size={14}/>} {label}</button>)}</div>
      </fieldset>)}
      {user?.roles.some(role => role === 'ADMIN' || role === 'LIBRARIAN') && <fieldset disabled={appearance.saving || appearance.loading} className="appearance-field"><legend>Widget bảng điều khiển</legend>
        <div className="appearance-options">{Object.entries(widgetLabels).map(([key, label]) => <button key={key} type="button"
          aria-pressed={draft.widgets.includes(key)} className={draft.widgets.includes(key) ? 'is-selected' : ''}
          onClick={() => toggleWidget(key)}>{draft.widgets.includes(key) && <Check size={14}/>} {label}</button>)}</div>
      </fieldset>}
    </div><aside className="appearance-preview" aria-label="Xem trước giao diện"><p className="eyebrow">Xem trước</p>
      <div className="appearance-preview-card"><span className="appearance-preview-tag">Thư viện LAMS</span>
        <h2>Một góc đọc của riêng bạn</h2><p>Thay đổi màu, bề mặt và khoảng cách để chọn cách đọc thoải mái nhất.</p>
        <span className="appearance-preview-button">Khám phá sách</span></div>
      <p className="appearance-help">{user ? 'Thiết lập được lưu trong tài khoản và dùng trên các thiết bị.'
        : 'Bạn đang dùng chế độ khách. Thiết lập chỉ lưu trong trình duyệt này.'}</p></aside></div>
    {appearance.error && <p role="alert" className="appearance-error">{appearance.error}</p>}
    {notice && <p role="status" className="appearance-notice">{notice}</p>}
    {dirty && <p role="status" className="appearance-dirty">Có thay đổi chưa lưu. Bạn có thể chuyển trang để xem thử rồi quay lại đây; tải lại ứng dụng sẽ bỏ bản xem thử.</p>}
    <div className="appearance-actions"><button type="button" className="button-primary" disabled={appearance.saving}
      onClick={() => void save()}>{appearance.saving ? 'Đang lưu…' : 'Lưu giao diện'}</button>
      <button type="button" disabled={appearance.saving} className="button-secondary" onClick={() => { appearance.discard(); setNotice('Đã bỏ thay đổi chưa lưu.'); }}>Bỏ thay đổi</button>
      <button type="button" disabled={appearance.saving} className="button-secondary" onClick={() => void save({ accent: 'blue', glass: 'standard', blur: 'on',
        sidebarStyle: 'floating', sidebarState: 'expanded', density: 'comfortable', radius: 'soft', fontSize: 'standard',
        motion: 'normal', bookView: 'grid', widgets: ['overview', 'circulation', 'inventory', 'acquisition'] })}>
        <RotateCcw size={15}/> Khôi phục mặc định</button></div>
  </section>;
}
