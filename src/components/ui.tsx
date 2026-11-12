import { AlertTriangle, CheckCircle2, Info, Loader2, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatScore } from '../domain/scoring';
import type { EvaluationStatus } from '../domain/types';

const STATUS_STYLES: Record<EvaluationStatus, { label: string; className: string }> = {
  todo: { label: 'À évaluer', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  'ai-proposed': { label: 'Proposition IA', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  evaluated: { label: 'Évaluée', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

export const STATUS_LABELS: Record<EvaluationStatus, string> = {
  todo: STATUS_STYLES.todo.label,
  'ai-proposed': STATUS_STYLES['ai-proposed'].label,
  evaluated: STATUS_STYLES.evaluated.label,
};

export function StatusBadge({ status }: { status: EvaluationStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${className}`}>
      {label}
    </span>
  );
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'accent' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600',
    warning: 'bg-orange-50 text-orange-700',
    accent: 'bg-accent-50 text-accent-600',
  };
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/** Score sur 5 ; « — » si non évalué. */
export function ScoreValue({ score, size = 'md' }: { score: number | null; size?: 'md' | 'lg' }) {
  const color =
    score === null ? 'text-slate-300' : score >= 4 ? 'text-emerald-700' : score >= 3 ? 'text-ink-900' : 'text-orange-700';
  return (
    <span className={`font-semibold tabular-nums ${color} ${size === 'lg' ? 'text-3xl' : 'text-sm'}`}>
      {formatScore(score)}
      {score !== null && <span className={`font-normal text-slate-400 ${size === 'lg' ? 'text-base' : 'text-xs'}`}>/5</span>}
    </span>
  );
}

export function KpiCard({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: string; icon: LucideIcon }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <div className="rounded-lg bg-slate-100 p-2 text-ink-700">
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-ink-900 tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-500">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warning'; title?: string; children: ReactNode }) {
  const styles = tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-accent-500/20 bg-accent-50 text-ink-800';
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`flex gap-3 rounded-lg border p-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}

export function ToastView({ message, tone, onClose }: { message: string; tone: 'success' | 'error' | 'info'; onClose: () => void }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertTriangle : Info;
  const color = tone === 'success' ? 'text-emerald-400' : tone === 'error' ? 'text-red-400' : 'text-sky-300';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="flex items-start gap-3 rounded-lg bg-ink-950 px-4 py-3 text-sm text-white shadow-lg">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
      <p className="flex-1">{message}</p>
      <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Fermer">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function formatDate(iso: string | null, raw?: string): string {
  if (!iso) return raw || '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
