import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './lib/auth.js';
import { Layout } from './components/Layout.js';
import { Login } from './pages/Login.js';
import { Dashboard } from './pages/Dashboard.js';
import { Donors } from './pages/Donors.js';
import { DonorForm } from './pages/DonorForm.js';
import { Batches } from './pages/Batches.js';
import { BatchDetail } from './pages/BatchDetail.js';
import { Pledges } from './pages/Pledges.js';
import { Reports } from './pages/Reports.js';
import { Settings } from './pages/Settings.js';
import { Members } from './pages/Members.js';
import { DataBackup } from './pages/DataBackup.js';
import { SettingsProvider } from './lib/settings.js';

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-primary-950 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary-300" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <SettingsProvider>
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<Reports />} />

        <Route path="/donors" element={<RequireRole roles={['bookkeeper', 'admin']}><Donors /></RequireRole>} />
        <Route path="/donors/new" element={<RequireRole roles={['bookkeeper', 'admin']}><DonorForm /></RequireRole>} />
        <Route path="/donors/:id/edit" element={<RequireRole roles={['bookkeeper', 'admin']}><DonorForm /></RequireRole>} />
        <Route path="/batches" element={<RequireRole roles={['viewer', 'bookkeeper', 'admin']}><Batches /></RequireRole>} />
        <Route path="/batches/:id" element={<RequireRole roles={['viewer', 'bookkeeper', 'admin']}><BatchDetail /></RequireRole>} />
        <Route path="/pledges" element={<RequireRole roles={['bookkeeper', 'admin']}><Pledges /></RequireRole>} />

        <Route path="/settings" element={<RequireRole roles={['bookkeeper', 'admin']}><Settings /></RequireRole>} />
        <Route path="/settings/categories" element={<Navigate to="/settings" replace />} />
        <Route path="/categories" element={<Navigate to="/settings" replace />} />
        <Route path="/data" element={<DataBackup />} />
        <Route path="/members" element={<RequireRole roles={['admin']}><Members /></RequireRole>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    </SettingsProvider>
  );
}
