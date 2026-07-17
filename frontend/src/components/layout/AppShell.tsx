import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building2,
  Users,
  KeyRound,
  Radio,
  Contact,
  MessagesSquare,
  Mail,
  LayoutTemplate,
  Image,
  ScrollText,
  Settings,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/organizations', label: 'Organizations', icon: Building2 },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound },
  { to: '/accounts', label: 'Accounts', icon: Radio },
  { to: '/contacts', label: 'Contacts', icon: Contact },
  { to: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { to: '/messages', label: 'Messages', icon: Mail },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/media', label: 'Media', icon: Image },
  { to: '/audit', label: 'Audit', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-slate-200">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
          Communication
        </div>
        <div className="mt-1 text-lg font-semibold text-white">Admin Console</div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white',
                isActive && 'bg-accent text-white hover:bg-accent',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="truncate text-sm font-medium text-white">
          {user?.email || 'Signed in'}
        </div>
        <div className="truncate text-xs text-slate-400">
          {user?.organization?.name || user?.organizationId || 'Organization'}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 lg:flex">
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 h-full w-72 max-w-[85vw] shadow-xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="text-sm font-semibold text-slate-900">Admin Console</div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
