import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { getProfile, statusLabels } from '../members/member-api';
import { MemberRequestError } from '../members/MemberRequestError';
import { Link } from 'react-router-dom';

export function ProfilePage() {
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: ['member-profile', user?.id],
    queryFn: ({ signal }) => getProfile(signal),
    enabled: !!user, retry: false, staleTime: 0,
  });
  return <section className="shell py-8" aria-labelledby="profile-heading">
    <p className="eyebrow">Tài khoản</p>
    <h1 id="profile-heading" className="page-title">Hồ sơ của tôi</h1>
    <p className="mt-2 text-muted">Thông tin tài khoản hiện chỉ hỗ trợ xem.</p>
    <Link className="text-link inline-block my-3" to="/thu-vien-cua-toi">Xem sách yêu thích và đánh giá của tôi</Link>
    {profile.isPending ? <p role="status" className="py-8">Đang tải hồ sơ…</p>
      : profile.isError ? <MemberRequestError error={profile.error} retry={() => void profile.refetch()} />
      : <div className="editorial-card mt-6">
        <dl className="grid gap-6 sm:grid-cols-2">
          {[['Họ và tên', profile.data.fullName], ['Mã thành viên', profile.data.memberCode],
            ['Email', profile.data.email], ['Trạng thái', statusLabels[profile.data.status]]].map(([label, value]) =>
            <div key={label} className="min-w-0"><dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 break-words font-semibold">{value}</dd></div>)}
        </dl>
        {profile.data.profile === null
          ? <p className="mt-6 border-t border-line pt-5 text-muted">Chưa có thông tin hồ sơ bổ sung. Bạn vẫn có thể sử dụng tài khoản bình thường.</p>
          : <p className="mt-6 text-muted">Hồ sơ cập nhật: {new Date(profile.data.profile.updatedAt).toLocaleString('vi-VN')}</p>}
      </div>}
  </section>;
}
