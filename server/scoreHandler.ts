/**
 * Traitement de POST /api/score, indépendant de Vercel, de Supabase et du fournisseur IA
 * (dépendances injectées) : entièrement testable sans réseau.
 *
 * Ordre des contrôles : configuration → authentification → appartenance à l'équipe →
 * validation de l'idée → appel du modèle. La clé du modèle ne quitte jamais le serveur.
 */
import { modelScoringToSuggestion, validateScoringInput, type ModelScoring, type ScoringInput } from '../src/ai/scoringPrompt.js';

export interface ScoreHandlerDeps {
  /** Le fournisseur réel est-il configuré (clé présente côté serveur) ? */
  isConfigured: boolean;
  /** Vérifie le jeton Supabase de l'appelant ; true si c'est un membre de l'équipe. */
  isTeamMember: (accessToken: string) => Promise<boolean>;
  /** Appelle le modèle et renvoie sa sortie structurée. */
  scoreIdea: (input: ScoringInput) => Promise<ModelScoring>;
  /** Identifiant enregistré avec la suggestion (ex. "anthropic:claude-opus-5-5"). */
  providerId: string;
  now?: () => Date;
}

export type ScoreErrorCode = 'not_configured' | 'unauthenticated' | 'forbidden' | 'invalid_request' | 'model_error' | 'method_not_allowed';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function error(status: number, code: ScoreErrorCode, message: string): Response {
  return json(status, { error: { code, message } });
}

export async function handleScoreRequest(request: Request, deps: ScoreHandlerDeps): Promise<Response> {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'Méthode non autorisée.');
  if (!deps.isConfigured) {
    return error(503, 'not_configured', "Le fournisseur d'IA n'est pas encore configuré sur le serveur.");
  }

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim();
  if (!token) return error(401, 'unauthenticated', 'Connexion requise.');
  let member = false;
  try {
    member = await deps.isTeamMember(token);
  } catch {
    member = false;
  }
  if (!member) return error(403, 'forbidden', "Ce compte n'est pas autorisé à utiliser l'IA.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, 'invalid_request', 'Corps de requête JSON invalide.');
  }
  const validation = validateScoringInput(body);
  if (!validation.ok) return error(400, 'invalid_request', validation.error);

  try {
    const output = await deps.scoreIdea(validation.input);
    const suggestion = modelScoringToSuggestion(validation.input.id, output, deps.providerId, deps.now?.() ?? new Date());
    return json(200, { suggestion });
  } catch (cause) {
    console.error('[api/score] échec de la notation', cause);
    return error(502, 'model_error', "Le modèle n'a pas pu proposer de note. Réessayez ou notez l'idée manuellement.");
  }
}
