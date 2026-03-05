import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { UpdatePasswordPage } from '@/features/auth/UpdatePasswordPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';

import { ApplicantList } from '@/features/applicants/ApplicantList';
import { ApplicantDetailsPage } from '@/features/applicants/ApplicantDetailsPage';
import { OfferList } from '@/features/offers/OfferList';
import { OfferEditor } from '@/features/offers/OfferEditor';
import { OfferPublicView } from '@/features/offers/OfferPublicView';

import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { EmployeeList } from '@/features/employees/EmployeeList';
import { AIDashboardPage } from '@/features/admin/pages/AIDashboardPage';

// Placeholder components for pages
// const Dashboard = () => <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="mt-4">Welcome to the HR Command Centre.</p></div>;
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ConnectorSettingsPage } from '@/features/settings/components/ConnectorSettingsPage';
import { LdGroupMappingsPage } from '@/features/settings/components/LdGroupMappingsPage';
import { UserManagementPage } from '@/features/settings/components/users/UserManagementPage';
import { ProfilePage } from '@/features/profile/ProfilePage';

// Placeholder components for pages
// const Dashboard = () => <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="mt-4">Welcome to the HR Command Centre.</p></div>;

import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="prolific-theme">
      <Toaster position="top-right" richColors closeButton />
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/offer/:token" element={<OfferPublicView />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/update-password" element={<UpdatePasswordPage />} />
            <Route path="/" element={<MainLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="applicants" element={<ApplicantList />} />
              <Route path="applicants/:id" element={<ApplicantDetailsPage />} />
              <Route path="offers" element={<OfferList />} />
              <Route path="offers/new" element={<OfferEditor />} />
              <Route path="employees" element={<EmployeeList />} />
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/connectors" element={<ConnectorSettingsPage />} />
                <Route path="settings/ld-mappings" element={<LdGroupMappingsPage />} />
                <Route path="settings/users" element={<UserManagementPage />} />
                <Route path="admin/ai-dashboard" element={<AIDashboardPage />} />
              </Route>
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
