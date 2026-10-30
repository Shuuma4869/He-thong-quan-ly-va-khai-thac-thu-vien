import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ReaderLayout } from '../layouts/ReaderLayout';
import { StaffLayout } from '../layouts/StaffLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { LoginPage } from '../../features/auth/LoginPage';
import { RegisterPage } from '../../features/auth/RegisterPage';
import { GuestRoute, ProtectedRoute, RoleGuard } from '../../features/auth/AuthGuards';
import { ReaderHomePage } from '../../features/discovery/ReaderHomePage';
const StaffDashboardPage = lazy(() => import('../../features/analytics/StaffDashboardPage').then(value => ({ default: value.StaffDashboardPage })));
import { NotFoundPage } from '../../shared/components/NotFoundPage';
const ProfilePage = lazy(() => import('../../features/profile/ProfilePage').then(value => ({ default: value.ProfilePage })));
const AppearancePage = lazy(() => import('../../features/appearance/AppearancePage').then(value => ({ default: value.AppearancePage })));
import { CatalogPage } from '../../features/catalog/CatalogPage';
import { BookDetailPage } from '../../features/catalog/BookDetailPage';
import { AuthorDetailPage } from '../../features/catalog/AuthorDetailPage';
import { DirectoryPage } from '../../features/catalog/DirectoryPage';
import { CategoryDetailPage } from '../../features/catalog/CategoryDetailPage';
const MyLibraryPage = lazy(() => import('../../features/my-library/MyLibraryPage').then(value => ({ default: value.MyLibraryPage })));
const HoldCreatePage = lazy(() => import('../../features/circulation/HoldCreatePage').then(value => ({ default: value.HoldCreatePage })));
const MemberListPage = lazy(() => import('../../features/members/MemberListPage').then(value => ({ default: value.MemberListPage })));
const StaffCatalogPage = lazy(() => import('../../features/catalog/StaffCatalogPage').then(value => ({ default: value.StaffCatalogPage })));
const ReaderLoansPage = lazy(() => import('../../features/circulation/ReaderLoansPage').then(value => ({ default: value.ReaderLoansPage })));
const StaffCirculationPage = lazy(() => import('../../features/circulation/StaffCirculationPage').then(value => ({ default: value.StaffCirculationPage })));
const CirculationReportPage = lazy(() => import('../../features/circulation/CirculationReportPage').then(value => ({ default: value.CirculationReportPage })));
const HoldActivityReportPage = lazy(() => import('../../features/circulation/HoldActivityReportPage').then(value => ({ default: value.HoldActivityReportPage })));
const StaffHoldManagementPage = lazy(() => import('../../features/circulation/StaffHoldManagementPage').then(value => ({ default: value.StaffHoldManagementPage })));
const InventorySessionsPage = lazy(() => import('../../features/inventory/InventorySessionsPage').then(value => ({ default: value.InventorySessionsPage })));
const InventorySessionPage = lazy(() => import('../../features/inventory/InventorySessionPage').then(value => ({ default: value.InventorySessionPage })));
const AcquisitionPage = lazy(() => import('../../features/acquisition/AcquisitionPage').then(value => ({ default: value.AcquisitionPage })));
const AdminAccountsPage = lazy(() => import('../../features/admin/AdminAccountsPage').then(value => ({ default: value.AdminAccountsPage })));
const ReviewReportsPage = lazy(() => import('../../features/admin/ReviewReportsPage').then(value => ({ default: value.ReviewReportsPage })));
const NotificationsPage = lazy(() => import('../../features/notifications/NotificationsPage').then(value => ({ default: value.NotificationsPage })));

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
        <Route path="cai-dat/giao-dien" element={<Deferred><AppearancePage /></Deferred>} />
        <Route path="sach" element={<CatalogPage />} />
        <Route path="sach/:bookId" element={<BookDetailPage />} />
        <Route path="tac-gia" element={<DirectoryPage kind="authors" />} />
        <Route path="tac-gia/:authorId" element={<AuthorDetailPage />} />
        <Route path="the-loai" element={<DirectoryPage kind="categories" />} />
        <Route path="the-loai/:categoryId" element={<CategoryDetailPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="ho-so" element={<Deferred><ProfilePage /></Deferred>} />
          <Route path="thu-vien-cua-toi" element={<Deferred><MyLibraryPage /></Deferred>} />
          <Route path="muon-va-giu-cho" element={<Deferred><ReaderLoansPage /></Deferred>} />
          <Route path="thong-bao" element={<Deferred><NotificationsPage /></Deferred>} />
          <Route path="giu-cho/:bookId/:editionId" element={<Deferred><HoldCreatePage /></Deferred>} />
        </Route>
      </Route>
      <Route element={<GuestRoute />}>
        <Route path="/dang-nhap" element={<LoginPage />} />
        <Route path="/dang-ky" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}><Route element={<RoleGuard allowed={['LIBRARIAN', 'ADMIN']} />}>
      <Route path="/nhan-vien" element={<StaffLayout />}>
        <Route index element={<Navigate to="bang-dieu-khien" replace />} />
        <Route path="bang-dieu-khien" element={<Deferred><StaffDashboardPage /></Deferred>} />
        <Route path="thanh-vien" element={<Deferred><MemberListPage /></Deferred>} />
        <Route path="danh-muc" element={<Deferred><StaffCatalogPage /></Deferred>} />
        <Route path="luu-thong" element={<Deferred><StaffCirculationPage /></Deferred>} />
        <Route path="giu-cho" element={<Deferred><StaffHoldManagementPage /></Deferred>} />
        <Route path="bao-cao-luu-thong" element={<Deferred><CirculationReportPage /></Deferred>} />
        <Route path="bao-cao-giu-cho" element={<Deferred><HoldActivityReportPage /></Deferred>} />
        <Route path="kiem-ke" element={<Deferred><InventorySessionsPage /></Deferred>} />
        <Route path="kiem-ke/:sessionId" element={<Deferred><InventorySessionPage /></Deferred>} />
        <Route path="de-xuat-bo-sung" element={<Deferred><AcquisitionPage /></Deferred>} />
        <Route element={<RoleGuard allowed={['ADMIN']} />}>
          <Route path="tai-khoan" element={<Deferred><AdminAccountsPage /></Deferred>} />
          <Route path="bao-cao-danh-gia" element={<Deferred><ReviewReportsPage /></Deferred>} />
        </Route>
      </Route>
      </Route></Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
