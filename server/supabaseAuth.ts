/**
 * Vérifie, côté serveur, qu'un jeton de session Supabase appartient à un membre de l'équipe.
 * Utilise la clé PUBLIQUE et le jeton de l'appelant : c'est la RLS / is_team_member() qui
 * tranche. Aucune clé service_role n'est nécessaire.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/data/database.types.js';

export function createTeamMemberCheck(url: string, publishableKey: string): (accessToken: string) => Promise<boolean> {
  return async (accessToken) => {
    const client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await client.rpc('is_team_member');
    return !error && data === true;
  };
}
