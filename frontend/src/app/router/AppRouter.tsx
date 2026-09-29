import { Navigate, Route, Routes } from 'react-router-dom';
import { ReaderLayout } from '../layouts/ReaderLayout';
import { StaffLayout } from '../layouts/StaffLayout';
import { LoginPage } from '../../features/auth/LoginPage';
import { RegisterPage } from '../../features/auth/RegisterPage';
import { GuestRoute, ProtectedRoute, RoleGuard } from '../../features/auth/AuthGuards';
import { ReaderHomePage } from '../../features/discovery/ReaderHomePage';
import { StaffDashboardPage } from '../../features/analytics/StaffDashboardPage';
import { NotFoundPage } from '../../shared/components/NotFoundPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<ReaderLayout />}>
        <Route index element={<ReaderHomePage />} />
      </Route>
      <Route element={<GuestRoute />}>
        <Route path="/dang-nhap" element={<LoginPage />} />
        <Route path="/dang-ky" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}><Route element={<RoleGuard allowed={['LIBRARIAN', 'ADMIN']} />}>
      <Route path="/nhan-vien" element={<StaffLayout />}>
        <Route index element={<Navigate to="bang-dieu-khien" replace />} />
        <Route path="bang-dieu-khien" element={<StaffDashboardPage />} />
      </Route>
      </Route></Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
