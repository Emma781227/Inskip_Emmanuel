/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_PROVIDER?: string;
  readonly VITE_SUPABASE_URL?: string;
  /** Clé publique « publishable » (sb_publishable_…). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Ancienne clé publique « anon » (JWT), acceptée par compatibilité si la précédente est absente. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
