import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { RequestAccessPage } from '@/features/auth/RequestAccessPage';
import { UpdatePasswordPage } from '@/features/auth/UpdatePasswordPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';

import { ApplicantList } from '@/features/applicants/ApplicantList';
import { ApplicantDetailsPage } from '@/features/applicants/ApplicantDetailsPage';
import { OfferList } from '@/features/offers/OfferList';
import { OfferEditor } from '@/features/offers/OfferEditor';
import { OfferPublicView } from '@/features/offers/OfferPublicView';

import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { EmployeeList } from '@/features/employees/EmployeeList';
import { TrainingPage } from '@/features/training/TrainingPage';
import { EmployeeTrainingDetailPage } from '@/features/training/EmployeeTrainingDetailPage';
import { AIDashboardPage } from '@/features/admin/pages/AIDashboardPage';
import { AccessRequestsPage } from '@/features/admin/pages/AccessRequestsPage';

import { ConnectorSettingsPage } from '@/features/settings/components/ConnectorSettingsPage';
import { TrainingComplianceRulesPage } from '@/features/settings/components/TrainingComplianceRulesPage';
import { UserManagementPage } from '@/features/settings/components/users/UserManagementPage';
import { SystemSettingsPage } from '@/features/settings/SystemSettingsPage';
import { ProfilePage } from '@/features/profile/ProfilePage';

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
          <Route path="/request-access" element={<RequestAccessPage />} />
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
              <Route path="training" element={<TrainingPage />} />
              <Route path="training/:employeeId" element={<EmployeeTrainingDetailPage />} />
              <Route element={<ProtectedRoute allowedRoles={['platform_admin', 'tenant_admin']} />}>
                <Route path="settings/connectors" element={<ConnectorSettingsPage />} />
                <Route path="settings/training-rules" element={<TrainingComplianceRulesPage />} />
                <Route path="settings/users" element={<UserManagementPage />} />
                <Route path="settings/system" element={<SystemSettingsPage />} />
                <Route path="admin/ai-dashboard" element={<AIDashboardPage />} />
                <Route element={<ProtectedRoute allowedRoles={['platform_admin']} />}>
                  <Route path="admin/access-requests" element={<AccessRequestsPage />} />
                </Route>
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
