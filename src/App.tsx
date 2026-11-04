import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, RequireAuth, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import Overview from './pages/Overview';
import Students from './pages/Students';
import FeeLedger from './pages/FeeLedger';
import Payments from './pages/Payments';
import Reminders from './pages/Reminders';
import RefundCalculator from './pages/RefundCalculator';
import Reports from './pages/Reports';
import RiskCounselling from './pages/RiskCounselling';
import Settings from './pages/Settings';
import NotificationsPage from './pages/NotificationsPage';
import AutomationPage from './pages/AutomationPage';
import DeadlinesPage from './pages/DeadlinesPage';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import ParentDashboard from './portal/ParentDashboard';

function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'parent') return <Navigate to="/parent/dashboard" replace />;
  if (user.role === 'student') return <Navigate to="/student/dashboard" replace />;
  return <Navigate to="/accounts/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            {/* Root Route: Intelligently routes to appropriate dashboard or login */}
            <Route path="/" element={<RootRedirect />} />

            {/* Unified Login */}
            <Route path="/login" element={<Login />} />

            {/* Centre Accounts Staff Routes */}
            <Route element={<RequireAuth roles={['accounts']}><ErrorBoundary><AppLayout /></ErrorBoundary></RequireAuth>}>
              <Route path="/accounts/dashboard" element={<Overview />} />
              <Route path="/students" element={<Students />} />
              <Route path="/deadlines" element={<DeadlinesPage />} />
              <Route path="/fee-ledger" element={<FeeLedger />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/reminders" element={<Reminders />} />
              <Route path="/refund-calculator" element={<RefundCalculator />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/risk-counselling" element={<RiskCounselling />} />
              <Route path="/automation" element={<AutomationPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Parent Portal Dashboard */}
            <Route path="/parent/dashboard" element={
              <RequireAuth roles={['parent']}><ErrorBoundary fallbackTitle="Parent Portal Error"><ParentDashboard /></ErrorBoundary></RequireAuth>
            } />
            <Route path="/parent-portal/dashboard" element={<Navigate to="/parent/dashboard" replace />} />
            <Route path="/parent-portal" element={<Navigate to="/login" replace />} />

            {/* Student Portal Dashboard */}
            <Route path="/student/dashboard" element={
              <RequireAuth roles={['student']}><ErrorBoundary fallbackTitle="Student Portal Error"><StudentDashboard /></ErrorBoundary></RequireAuth>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
