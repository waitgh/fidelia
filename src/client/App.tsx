import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './lib/auth.js';
import { Layout } from './components/Layout.js';
import { Login } from './pages/Login.js';
import { Dashboard } from './pages/Dashboard.js';
import { SettingsProvider } from './lib/settings.js';
import { lazy, Suspense } from 'react';

const page = <K extends string>(name: K, load: () => Promise<Record<K, React.ComponentType>>) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const DonorForm = page('DonorForm', () => import('./pages/DonorForm.js'));
const Donors = page('Donors', () => import('./pages/Donors.js'));
const Batches = page('Batches', () => import('./pages/Batches.js'));
const BatchDetail = page('BatchDetail', () => import('./pages/BatchDetail.js'));
const Pledges = page('Pledges', () => import('./pages/Pledges.js'));
const Reports = page('Reports', () => import('./pages/Reports.js'));
const Settings = page('Settings', () => import('./pages/Settings.js'));
const Members = page('Members', () => import('./pages/Members.js'));
const DataBackup = page('DataBackup', () => import('./pages/DataBackup.js'));

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
      <Suspense fallback={<div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-400" /></div>}>
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
      </Suspense>
    </Layout>
    </SettingsProvider>
  );
}
