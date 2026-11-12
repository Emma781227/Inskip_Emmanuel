import { Lightbulb, ListChecks, LayoutDashboard } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from '../state/AppStore';
import { ToastView } from './ui';

function NavItem({ to, label, icon: Icon, badge }: { to: string; label: string; icon: typeof LayoutDashboard; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-white/12 text-white' : 'text-slate-300 hover:bg-white/6 hover:text-white'
        }`
      }
    >
      <Icon className="size-4" aria-hidden />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-white/15 px-1.5 text-xs tabular-nums text-white">{badge}</span>
      )}
    </NavLink>
  );
}

export function Layout() {
  const { workspace, dataset, persistent, toasts, dismissToast } = useAppStore();
  const shortlistCount = Object.keys(workspace.shortlist).length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print bg-ink-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2 text-white">
            <span className="grid size-8 place-items-center rounded-lg bg-white/10">
              <Lightbulb className="size-4" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">IdeaPilot</span>
              <span className="block max-w-[14rem] truncate text-xs text-slate-400">{dataset.name}</span>
            </span>
          </NavLink>
          <nav className="flex items-center gap-1" aria-label="Navigation principale">
            <NavItem to="/" label="Idées" icon={LayoutDashboard} />
            <NavItem to="/shortlist" label="Shortlist" icon={ListChecks} badge={shortlistCount} />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="no-print border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-slate-500 sm:px-6">
          {persistent
            ? 'Vos évaluations sont enregistrées dans ce navigateur uniquement (pas de compte, pas de serveur). '
            : 'Stockage du navigateur indisponible : vos évaluations seront perdues à la fermeture de l’onglet. '}
          Les notes « IA » sont une simulation à base de règles, à valider par la consultante.
        </div>
      </footer>

      <div className="no-print fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <ToastView key={toast.id} message={toast.message} tone={toast.tone} onClose={() => dismissToast(toast.id)} />
        ))}
      </div>
    </div>
  );
}
