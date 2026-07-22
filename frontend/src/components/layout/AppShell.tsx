import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
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
  Megaphone,
  Sparkles,
  Moon,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { useRealtime } from '../../hooks/useRealtime';
import { useCan } from '../../hooks/useCan';
import { api } from '../../lib/api';
import {
  applyTheme,
  readStoredTheme,
  type ThemePreference,
} from '../../lib/theme';
import { navAllowed } from '../../lib/roles';
import { cn } from '../../lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/accounts', label: 'WhatsApp', icon: Radio },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound },
  { to: '/contacts', label: 'Contacts', icon: Contact },
  { to: '/conversations', label: 'Inbox', icon: MessagesSquare },
  { to: '/messages', label: 'Messages', icon: Mail },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/agents', label: 'AI Agents', icon: Sparkles },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/media', label: 'Media', icon: Image },
  { to: '/audit', label: 'Audit', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const { user, logout, isAuthenticated } = useAuth();
  const { role } = useCan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => readStoredTheme());
  useRealtime();

  const visibleNav = nav.filter((item) => navAllowed(item.to, role));

  const prefs = useQuery({
    queryKey: ['preferences'],
    enabled: Boolean(isAuthenticated),
    queryFn: async () => {
      const { data } = await api.get<{ data: { theme?: string } }>(
        '/admin/v1/auth/preferences',
      );
      return data.data;
    },
  });

  useEffect(() => {
    const serverTheme = prefs.data?.theme;
    if (
      serverTheme === 'light' ||
      serverTheme === 'dark' ||
      serverTheme === 'system'
    ) {
      setTheme(serverTheme);
      applyTheme(serverTheme);
      return;
    }
    applyTheme(theme);
  }, [prefs.data?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const saveTheme = useMutation({
    mutationFn: async (next: ThemePreference) => {
      await api.patch('/admin/v1/auth/preferences', { theme: next });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['preferences'] });
    },
  });

  const toggleTheme = () => {
    const next: ThemePreference = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    saveTheme.mutate(next);
  };

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-zinc-300">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
          WhatsApp
        </div>
        <div className="mt-1 text-lg font-semibold tracking-tight text-white">
          Admin Console
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {visibleNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white',
                isActive &&
                  'bg-white text-zinc-950 shadow-sm hover:bg-white hover:text-zinc-950',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            navigate('/profile');
          }}
          className="w-full rounded-md px-1 py-1 text-left hover:bg-white/5"
        >
          <div className="truncate text-sm font-medium text-white">
            {user?.email || 'Signed in'}
          </div>
          <div className="truncate text-xs text-zinc-500">
            {user?.organization?.name || user?.organizationId || 'Organization'}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400 underline-offset-2 hover:text-white hover:underline">
            Open profile
          </div>
        </button>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-2.5 py-1.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-zinc-950 lg:flex">
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 h-full w-72 max-w-[85vw] shadow-xl">
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 lg:hidden">
          <button
            type="button"
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Admin Console
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="ml-auto rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Toggle appearance"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </header>
        <main className="flex-1 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8 dark:text-zinc-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
