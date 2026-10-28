import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ReaderLayout } from '../layouts/ReaderLayout';
import { StaffLayout } from '../layouts/StaffLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { LoginPage } from '../../features/auth/LoginPage';
import { RegisterPage } from '../../features/auth/RegisterPage';
import { GuestRoute, ProtectedRoute, RoleGuard } from '../../features/auth/AuthGuards';
import { ReaderHomePage } from '../../features/discovery/ReaderHomePage';
import { StaffDashboardPage } from '../../features/analytics/StaffDashboardPage';
import { NotFoundPage } from '../../shared/components/NotFoundPage';
import { ProfilePage } from '../../features/profile/ProfilePage';
import { CatalogPage } from '../../features/catalog/CatalogPage';
import { BookDetailPage } from '../../features/catalog/BookDetailPage';
import { AuthorDetailPage } from '../../features/catalog/AuthorDetailPage';
import { DirectoryPage } from '../../features/catalog/DirectoryPage';
import { CategoryDetailPage } from '../../features/catalog/CategoryDetailPage';
import { MyLibraryPage } from '../../features/my-library/MyLibraryPage';
import { HoldCreatePage } from '../../features/circulation/HoldCreatePage';
const MemberListPage = lazy(() => import('../../features/members/MemberListPage').then(value => ({ default: value.MemberListPage })));
const StaffCatalogPage = lazy(() => import('../../features/catalog/StaffCatalogPage').then(value => ({ default: value.StaffCatalogPage })));
const ReaderLoansPage = lazy(() => import('../../features/circulation/ReaderLoansPage').then(value => ({ default: value.ReaderLoansPage })));
const StaffCirculationPage = lazy(() => import('../../features/circulation/StaffCirculationPage').then(value => ({ default: value.StaffCirculationPage })));
const CirculationReportPage = lazy(() => import('../../features/circulation/CirculationReportPage').then(value => ({ default: value.CirculationReportPage })));
const InventorySessionsPage = lazy(() => import('../../features/inventory/InventorySessionsPage').then(value => ({ default: value.InventorySessionsPage })));
const InventorySessionPage = lazy(() => import('../../features/inventory/InventorySessionPage').then(value => ({ default: value.InventorySessionPage })));
const AcquisitionPage = lazy(() => import('../../features/acquisition/AcquisitionPage').then(value => ({ default: value.AcquisitionPage })));
const AdminAccountsPage = lazy(() => import('../../features/admin/AdminAccountsPage').then(value => ({ default: value.AdminAccountsPage })));

function Deferred({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status" className="shell py-8">Đang tải trang…</p>}>{children}</Suspense>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<ReaderHomePage />} />
      </Route>
      <Route element={<ReaderLayout />}>
        <Route path="sach" element={<CatalogPage />} />
        <Route path="sach/:bookId" element={<BookDetailPage />} />
        <Route path="tac-gia" element={<DirectoryPage kind="authors" />} />
        <Route path="tac-gia/:authorId" element={<AuthorDetailPage />} />
        <Route path="the-loai" element={<DirectoryPage kind="categories" />} />
        <Route path="the-loai/:categoryId" element={<CategoryDetailPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="ho-so" element={<ProfilePage />} />
          <Route path="thu-vien-cua-toi" element={<MyLibraryPage />} />
          <Route path="muon-va-giu-cho" element={<Deferred><ReaderLoansPage /></Deferred>} />
          <Route path="giu-cho/:bookId/:editionId" element={<HoldCreatePage />} />
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
        <Route path="thanh-vien" element={<Deferred><MemberListPage /></Deferred>} />
        <Route path="danh-muc" element={<Deferred><StaffCatalogPage /></Deferred>} />
        <Route path="luu-thong" element={<Deferred><StaffCirculationPage /></Deferred>} />
        <Route path="bao-cao-luu-thong" element={<Deferred><CirculationReportPage /></Deferred>} />
        <Route path="kiem-ke" element={<Deferred><InventorySessionsPage /></Deferred>} />
        <Route path="kiem-ke/:sessionId" element={<Deferred><InventorySessionPage /></Deferred>} />
        <Route path="de-xuat-bo-sung" element={<Deferred><AcquisitionPage /></Deferred>} />
        <Route element={<RoleGuard allowed={['ADMIN']} />}>
          <Route path="tai-khoan" element={<Deferred><AdminAccountsPage /></Deferred>} />
        </Route>
      </Route>
      </Route></Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
