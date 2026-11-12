/**
 * Fonction Vercel : POST /api/score — proposition de notes par un vrai modèle.
 *
 * Inactive tant que ANTHROPIC_API_KEY n'est pas définie (réponse 503 « not_configured »),
 * l'application utilisant alors la simulation (VITE_AI_PROVIDER=mock, défaut).
 *
 * Variables serveur (Vercel > Settings > Environment Variables, sans préfixe VITE_ pour la clé) :
 *   ANTHROPIC_API_KEY  clé de l'API Claude — secrète
 *   AI_MODEL           optionnel, défaut claude-opus-5-5
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) : déjà définies pour le front
 */
import { createAnthropicScorer, DEFAULT_AI_MODEL } from '../server/anthropicScorer.js';
import { handleScoreRequest } from '../server/scoreHandler.js';
import { createTeamMemberCheck } from '../server/supabaseAuth.js';

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  const model = process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  return handleScoreRequest(request, {
    isConfigured: apiKey !== '' && supabaseUrl !== '' && supabaseKey !== '',
    isTeamMember: createTeamMemberCheck(supabaseUrl, supabaseKey),
    scoreIdea: apiKey ? createAnthropicScorer(apiKey, model) : async () => Promise.reject(new Error('non configuré')),
    providerId: `anthropic:${model}`,
  });
}
