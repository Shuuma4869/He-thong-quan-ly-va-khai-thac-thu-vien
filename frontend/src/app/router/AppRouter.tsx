import { Navigate, Route, Routes } from 'react-router-dom';
import { ReaderLayout } from '../layouts/ReaderLayout';
import { StaffLayout } from '../layouts/StaffLayout';
import { LoginPage } from '../../features/auth/LoginPage';
import { ReaderHomePage } from '../../features/discovery/ReaderHomePage';
import { StaffDashboardPage } from '../../features/analytics/StaffDashboardPage';
import { NotFoundPage } from '../../shared/components/NotFoundPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<ReaderLayout />}>
        <Route index element={<ReaderHomePage />} />
      </Route>
      <Route path="/dang-nhap" element={<LoginPage />} />
      <Route path="/nhan-vien" element={<StaffLayout />}>
        <Route index element={<Navigate to="bang-dieu-khien" replace />} />
        <Route path="bang-dieu-khien" element={<StaffDashboardPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
