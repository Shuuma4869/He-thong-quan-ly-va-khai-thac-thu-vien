import { Navigate, Route, Routes } from 'react-router-dom';
import { ReaderLayout } from '../layouts/ReaderLayout';
import { StaffLayout } from '../layouts/StaffLayout';
import { LoginPage } from '../../features/auth/LoginPage';
import { RegisterPage } from '../../features/auth/RegisterPage';
import { GuestRoute, ProtectedRoute, RoleGuard } from '../../features/auth/AuthGuards';
import { ReaderHomePage } from '../../features/discovery/ReaderHomePage';
import { StaffDashboardPage } from '../../features/analytics/StaffDashboardPage';
import { NotFoundPage } from '../../shared/components/NotFoundPage';
import { ProfilePage } from '../../features/profile/ProfilePage';
import { MemberListPage } from '../../features/members/MemberListPage';
import { CatalogPage } from '../../features/catalog/CatalogPage';
import { BookDetailPage } from '../../features/catalog/BookDetailPage';
import { AuthorDetailPage } from '../../features/catalog/AuthorDetailPage';
import { StaffCatalogPage } from '../../features/catalog/StaffCatalogPage';
import { MyLibraryPage } from '../../features/my-library/MyLibraryPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<ReaderLayout />}>
        <Route index element={<ReaderHomePage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="ho-so" element={<ProfilePage />} />
          <Route path="thu-vien-cua-toi" element={<MyLibraryPage />} />
          <Route path="sach" element={<CatalogPage />} />
          <Route path="sach/:bookId" element={<BookDetailPage />} />
          <Route path="tac-gia/:authorId" element={<AuthorDetailPage />} />
        </Route>
      </Route>
      <Route element={<GuestRoute />}>
        <Route path="/dang-nhap" element={<LoginPage />} />
        <Route path="/dang-ky" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}><Route element={<RoleGuard allowed={['LIBRARIAN', 'ADMIN']} />}>
      <Route path="/nhan-vien" element={<StaffLayout />}>
        <Route index element={<Navigate to="bang-dieu-khien" replace />} />
        <Route path="bang-dieu-khien" element={<StaffDashboardPage />} />
        <Route path="thanh-vien" element={<MemberListPage />} />
        <Route path="danh-muc" element={<StaffCatalogPage />} />
      </Route>
      </Route></Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
