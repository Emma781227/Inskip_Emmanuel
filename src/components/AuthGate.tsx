import { Lightbulb, Loader2, LockKeyhole, Settings, ShieldAlert } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { supabaseConfig } from '../data/supabaseClient';
import { useAppStore } from '../state/AppStore';
import { LoadingState } from './ui';

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-ink-900">
          <span className="grid size-9 place-items-center rounded-lg bg-ink-900 text-white">
            <Lightbulb className="size-4" aria-hidden />
          </span>
          <span className="text-lg font-semibold">IdeaPilot</span>
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

function ConfigMissing({ problems }: { problems: string[] }) {
  return (
    <CenteredCard>
      <div className="flex items-center gap-2 text-ink-900">
        <Settings className="size-5" aria-hidden />
        <h1 className="text-lg font-semibold">Configuration requise</h1>
      </div>
      <p className="mt-2 text-sm text-slate-600">L'application n'est pas encore reliée à sa base de données Supabase.</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-700">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-slate-500">Voir le fichier .env.example et la section « Livraison » du README.</p>
    </CenteredCard>
  );
}

function LoginForm() {
  const { signIn } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(await signIn(email, password));
    setSubmitting(false);
  };

  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold text-ink-900">Connexion</h1>
      <p className="mt-1 text-sm text-slate-500">Accès réservé à l'équipe INSKIP du challenge innovation.</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <label className="block">
          <span className="label">Adresse e-mail</span>
          <input className="field" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="block">
          <span className="label">Mot de passe</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LockKeyhole className="size-4" aria-hidden />}
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="mt-6 text-xs text-slate-500">Pas de compte ? Les accès sont créés par l'administrateur de l'outil.</p>
    </CenteredCard>
  );
}

function NotMember({ email }: { email: string }) {
  const { signOut } = useAppStore();
  return (
    <CenteredCard>
      <div className="flex items-center gap-2 text-ink-900">
        <ShieldAlert className="size-5 text-orange-600" aria-hidden />
        <h1 className="text-lg font-semibold">Accès non autorisé</h1>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Le compte <strong>{email}</strong> est bien connecté, mais il n'est pas encore autorisé à consulter les idées du challenge.
        Demandez à l'administrateur de l'ajouter à l'équipe.
      </p>
      <button type="button" className="btn-secondary mt-6 w-full" onClick={signOut}>
        Se déconnecter
      </button>
    </CenteredCard>
  );
}

/** N'affiche l'application qu'à un membre de l'équipe connecté. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { auth } = useAppStore();
  if (!supabaseConfig.ok) return <ConfigMissing problems={supabaseConfig.problems} />;
  switch (auth.status) {
    case 'checking':
      return <LoadingState label="Vérification de la session…" />;
    case 'signed-out':
      return <LoginForm />;
    case 'not-member':
      return <NotMember email={auth.email} />;
    case 'signed-in':
      return <>{children}</>;
  }
}
