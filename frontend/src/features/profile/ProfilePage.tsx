import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Heart, KeyRound, Mail, ShieldCheck, Star, UserRound } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { MemberRequestError } from '../members/MemberRequestError';
import { statusLabels } from '../members/member-api';
import { cancelEmailRequest, changePassword, confirmEmail, getAccount, requestEmail, updateAccount } from './account-api';

export function ProfilePage() {
  const { user, logout, refreshSession } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const account = useQuery({ queryKey: ['account', user?.id], queryFn: ({ signal }) => getAccount(signal), enabled: !!user, retry: false });
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''); const [nextPassword, setNextPassword] = useState('');
  const [emailPassword, setEmailPassword] = useState(''); const [nextEmail, setNextEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (account.data) { setName(account.data.fullName); setPhone(account.data.phone ?? ''); } }, [account.data]);
  const profileChange = useMutation({ mutationFn: () => updateAccount(name, phone), onSuccess: async data => {
    client.setQueryData(['account', user?.id], data); await refreshSession();
    setNotice('Đã cập nhật thông tin cá nhân.');
  } });
  const passwordChange = useMutation({ mutationFn: () => changePassword(currentPassword, nextPassword), onSuccess: async () => {
    setCurrentPassword(''); setNextPassword(''); await logout(); navigate('/dang-nhap', { replace: true });
  } });
  const emailChange = useMutation({ mutationFn: () => requestEmail(emailPassword, nextEmail), onSuccess: data => {
    client.setQueryData(['account', user?.id], data); setEmailPassword(''); setNextEmail('');
    setNotice('Mã xác minh đã được gửi tới email mới. Mã có hiệu lực 15 phút.');
  } });
  const emailConfirmation = useMutation({ mutationFn: () => confirmEmail(emailCode), onSuccess: async () => {
    setEmailCode(''); await logout(); navigate('/dang-nhap', { replace: true });
  } });
  const cancelEmail = useMutation({ mutationFn: cancelEmailRequest, onSuccess: async () => {
    await account.refetch(); setNotice('Đã hủy yêu cầu đổi email.');
  } });
  const submit = (event: FormEvent, action: () => void) => { event.preventDefault(); setNotice(''); action(); };
  return <section className="shell library-page account-page py-8" aria-labelledby="profile-heading">
    <nav className="catalog-breadcrumb" aria-label="Đường dẫn"><Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Hồ sơ</span></nav>
    <header className="account-hero"><div className="account-avatar"><UserRound size={33} aria-hidden="true"/></div><div>
      <p className="eyebrow">Tài khoản LAMS</p><h1 id="profile-heading">Hồ sơ của tôi</h1>
      <p>Thông tin liên hệ và bảo mật tài khoản ở cùng một nơi.</p></div></header>
    {notice && <p className="account-notice" role="status">{notice}</p>}
    {account.isPending ? <p role="status" className="py-8">Đang tải hồ sơ…</p>
      : account.isError ? <MemberRequestError error={account.error} retry={() => void account.refetch()}/>
        : <div className="account-grid">
          <section className="account-panel" aria-label="Thông tin cá nhân"><div className="account-panel-heading"><UserRound size={20}/><h2>Thông tin cá nhân</h2></div>
            <form onSubmit={event => submit(event, () => profileChange.mutate())}>
              <label className="field">Họ và tên<input value={name} maxLength={150} required onChange={event => setName(event.target.value)}/></label>
              <label className="field">Số điện thoại<input type="tel" value={phone} maxLength={16} autoComplete="tel"
                placeholder="+84901234567" onChange={event => setPhone(event.target.value)}/></label>
              <p className="account-help">Dùng mã quốc gia và chỉ nhập số. Để trống nếu bạn không muốn cung cấp.</p>
              <dl className="account-readonly"><div><dt>Mã thành viên</dt><dd>{account.data.memberCode}</dd></div>
                <div><dt>Trạng thái</dt><dd>{statusLabels[account.data.status]}</dd></div></dl>
              <button type="submit" className="button-primary" disabled={profileChange.isPending || !name.trim()}>Lưu thay đổi</button>
              {profileChange.isError && <p role="alert" className="account-error">Chưa lưu được hồ sơ. Kiểm tra họ tên, số liên hệ hoặc thử lại.</p>}
            </form></section>
          <section className="account-panel" aria-label="Đổi mật khẩu"><div className="account-panel-heading"><KeyRound size={20}/><h2>Đổi mật khẩu</h2></div>
            <p className="account-help">Sau khi đổi mật khẩu, các phiên đăng nhập sẽ cần xác thực lại.</p>
            <form onSubmit={event => submit(event, () => passwordChange.mutate())}>
              <label className="field">Mật khẩu hiện tại<input type="password" autoComplete="current-password" required value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}/></label>
              <label className="field">Mật khẩu mới<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required
                value={nextPassword} onChange={event => setNextPassword(event.target.value)}/></label>
              <p className="account-help">Ít nhất 12 ký tự, có chữ và số.</p>
              <button type="submit" className="button-primary" disabled={passwordChange.isPending}>Đổi mật khẩu</button>
              {passwordChange.isError && <p role="alert" className="account-error">Chưa đổi được mật khẩu. Kiểm tra mật khẩu hiện tại và điều kiện mật khẩu mới.</p>}
            </form></section>
          <section className="account-panel" aria-label="Địa chỉ email"><div className="account-panel-heading"><Mail size={20}/><h2>Địa chỉ email</h2></div>
            <p className="account-current-email">Email đang dùng: <strong>{account.data.email}</strong></p>
            {account.data.pendingEmail && <div className="account-pending"><p>Đang chờ xác minh: <strong>{account.data.pendingEmail}</strong></p>
              <button type="button" className="text-link" disabled={cancelEmail.isPending} onClick={() => cancelEmail.mutate()}>Hủy yêu cầu</button></div>}
            {account.data.pendingEmail && account.data.emailVerificationEnabled && <form onSubmit={event => submit(event, () => emailConfirmation.mutate())}>
              <label className="field">Mã xác minh<input value={emailCode} required minLength={12} maxLength={12} autoComplete="one-time-code"
                onChange={event => setEmailCode(event.target.value.toUpperCase())}/></label>
              <p className="account-help">Nhập mã trong email mới. Mã hết hạn sau 15 phút; nhập sai tối đa 5 lần. Khi xác minh xong, bạn cần đăng nhập lại bằng email mới.</p>
              <button type="submit" className="button-primary" disabled={emailConfirmation.isPending}>Xác minh email</button>
              {emailConfirmation.isError && <p role="alert" className="account-error">Mã không hợp lệ hoặc đã hết hạn. Kiểm tra lại hoặc yêu cầu mã mới.</p>}
            </form>}
            {account.data.emailVerificationEnabled ? <p className="account-help">Bạn có thể yêu cầu mã mới sau 1 phút, tối đa 5 lần trong 24 giờ.</p>
              : <p className="account-help">Máy chủ hiện chưa bật gửi mã xác minh. Email đăng nhập vẫn giữ nguyên; hãy liên hệ người vận hành nếu cần đổi.</p>}
            {account.data.emailVerificationEnabled && <form onSubmit={event => submit(event, () => emailChange.mutate())}>
              <label className="field">Email mới<input type="email" autoComplete="email" required maxLength={320} value={nextEmail}
                onChange={event => setNextEmail(event.target.value)}/></label>
              <label className="field">Mật khẩu hiện tại<input type="password" autoComplete="current-password" required value={emailPassword}
                onChange={event => setEmailPassword(event.target.value)}/></label>
              <button type="submit" className="button-secondary" disabled={emailChange.isPending}>Gửi mã xác minh</button>
              {emailChange.isError && <p role="alert" className="account-error">Chưa gửi được mã. Kiểm tra mật khẩu, địa chỉ email hoặc cấu hình gửi thư.</p>}
            </form>}</section>
          <section className="account-panel account-activity" aria-label="Hoạt động của tôi"><div className="account-panel-heading"><ShieldCheck size={20}/><h2>Hoạt động của tôi</h2></div>
            <p className="account-help">Xem dữ liệu thật trong tài khoản của bạn.</p>
            <div className="account-shortcuts"><Link to="/thu-vien-cua-toi#sach-yeu-thich"><Heart size={19}/> Sách yêu thích →</Link>
              <Link to="/thu-vien-cua-toi#danh-gia"><Star size={19}/> Đánh giá của tôi →</Link>
              <Link to="/muon-va-giu-cho"><BookOpen size={19}/> Mượn và giữ chỗ →</Link></div>
          </section>
        </div>}
  </section>;
}
