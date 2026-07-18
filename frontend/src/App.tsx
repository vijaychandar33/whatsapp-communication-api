import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { JoinPage } from './pages/JoinPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AccountsPage } from './pages/AccountsPage';
import { ContactsPage } from './pages/ContactsPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { MessagesPage } from './pages/MessagesPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { MediaPage } from './pages/MediaPage';
import { AuditPage } from './pages/AuditPage';
import { AgentsPage } from './pages/AgentsPage';
import { BroadcastsPage, BroadcastDetailPage } from './pages/BroadcastsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';

function ProtectedRoute() {
  const { ready, isAuthenticated } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="organizations" element={<Navigate to="/profile" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="broadcasts" element={<BroadcastsPage />} />
          <Route path="broadcasts/:id" element={<BroadcastDetailPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
