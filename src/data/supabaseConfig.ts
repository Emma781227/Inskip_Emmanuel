/**
 * Lecture de la configuration Supabase (variables publiques, embarquées dans le navigateur).
 * Seules l'URL du projet et la clé PUBLIQUE sont attendues ici ; la protection des données
 * repose sur Supabase Auth + RLS, pas sur le secret de cette clé.
 * Ne jamais renseigner de clé `service_role` / `sb_secret_…` dans une variable VITE_.
 */

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
  /** Variable d'où vient la clé, pour le diagnostic. */
  keySource: 'VITE_SUPABASE_PUBLISHABLE_KEY' | 'VITE_SUPABASE_ANON_KEY';
}

export type SupabaseConfigResult = { ok: true; config: SupabaseConfig } | { ok: false; problems: string[] };

interface EnvLike {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** Décode la charge utile d'un JWT (anciennes clés anon / service_role) sans vérifier la signature. */
function jwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json === 'object' && json !== null && 'role' in json && typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

export function readSupabaseConfig(env: EnvLike): SupabaseConfigResult {
  const problems: string[] = [];
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  // Clé publishable (nouveau format sb_publishable_…) en priorité ; clé anon (JWT) acceptée par compatibilité.
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  const anon = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  const key = publishable || anon;
  const keySource = publishable ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : 'VITE_SUPABASE_ANON_KEY';

  if (!url) problems.push('VITE_SUPABASE_URL est manquante.');
  else if (!/^https:\/\/[^\s/]+/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    problems.push('VITE_SUPABASE_URL doit être une URL https (ex. https://xxxx.supabase.co).');
  }

  if (!key) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) est manquante.');
  else if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    // Garde-fou : on refuse de démarrer plutôt que d'utiliser une clé secrète dans le navigateur.
    problems.push('La clé fournie est une clé SECRÈTE (service_role). Utilisez la clé publique « publishable » ou « anon ».');
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, config: { url, publishableKey: key, keySource } };
}
