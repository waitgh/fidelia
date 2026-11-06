import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  FileBarChart,
  HandHeart,
  CloudCog,
  LogOut,
  Shield,
  Cog,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings.js';
import { LogoMark } from './Logo.js';

const navItems = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard',    roles: ['viewer', 'bookkeeper', 'admin'] },
  { to: '/donors',  icon: Users,           label: 'Donors',       roles: ['bookkeeper', 'admin'] },
  { to: '/batches', icon: FolderOpen,      label: 'Batches',      roles: ['viewer', 'bookkeeper', 'admin'] },
  { to: '/pledges', icon: HandHeart,       label: 'Pledges',      roles: ['bookkeeper', 'admin'] },
  { to: '/reports', icon: FileBarChart,    label: 'Reports',      roles: ['viewer', 'bookkeeper', 'admin'] },
  { to: '/settings',icon: Cog,            label: 'Settings',     roles: ['bookkeeper', 'admin'] },
  { to: '/data',    icon: CloudCog,        label: 'Data & Backup',roles: ['viewer', 'bookkeeper', 'admin'] },
  { to: '/members', icon: Shield,          label: 'Members',      roles: ['admin'] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, saveState } = useAuth();
  const { churchName } = useSettings();
  // Icons-only sidebar by default on phones.
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  const visibleNavItems = navItems.filter(
    (item) => user && item.roles.includes(user.role),
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <aside
        className={`${
          collapsed ? 'w-14' : 'w-64'
        } bg-primary-900 text-white flex flex-col shrink-0 transition-all duration-200`}
      >
        {/* ── Logo header ── */}
        <div className="border-b border-white/10">
          {collapsed ? (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10">
                <LogoMark size={20} />
              </div>
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="p-1 text-primary-400 hover:text-white rounded transition-colors"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Row 1: logo mark + wordmark + collapse button */}
              <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-[9px] bg-white/10 flex items-center justify-center shrink-0">
                    <LogoMark size={20} />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="font-bold text-[15px] leading-none tracking-tight text-white"
                      style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                    >
                      Fidelia
                    </span>
                    <span
                      className="font-light text-[12px] leading-none tracking-wide text-yellow-300"
                      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
                    >
                      Ledger
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setCollapsed((c) => !c)}
                  className="p-1 text-primary-400 hover:text-white rounded transition-colors shrink-0"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              {/* Row 2: church name */}
              {churchName && (
                <div className="flex items-start gap-1.5 px-4 pb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/50 shrink-0 mt-[3px]" />
                  <p className="text-[11px] text-white/65 leading-snug break-words">{churchName}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {visibleNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-700 text-white'
                    : 'text-primary-300 hover:bg-primary-800 hover:text-white'
                }`
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

        {/* ── User footer ── */}
        <div className="px-2 py-3 border-t border-white/10">
          {user && (
            <div className="flex items-center gap-2">
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
                  <p className="text-[10px] text-primary-400 capitalize">{user.role}
                    <span className={saveState === 'error' ? 'text-red-400' : ''}> · {saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Saving…'}</span></p>
                </div>
              )}
              <button
                onClick={logout}
                className="p-1.5 text-primary-400 hover:text-white rounded transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
          {!collapsed && (
            <p className="mt-2 text-[10px] text-primary-700">v{__APP_VERSION__}</p>
          )}
        </div>
      </aside>

      <main id="app-main-scroll" className="flex-1 min-w-0 overflow-y-auto bg-gray-50/50">
        <div className="p-3 sm:p-5 md:p-8">{children}</div>
      </main>
    </div>
  );
}
