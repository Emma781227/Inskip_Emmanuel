/**
 * Fournisseur « vrai modèle » côté navigateur : appelle la fonction serveur /api/score,
 * qui détient la clé. Le navigateur n'envoie que le jeton de session Supabase et le
 * contenu de l'idée (sans son auteur).
 */
import type { AiSuggestion, Idea } from '../domain/types';
import type { AiScoringProvider } from './AiScoringProvider';
import { parseAiSuggestionPayload, toScoringInput } from './scoringPrompt';

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

const MESSAGES: Record<string, string> = {
  not_configured: "L'IA n'est pas encore activée sur le serveur. Utilisez la simulation ou notez l'idée manuellement.",
  unauthenticated: 'Votre session a expiré. Reconnectez-vous.',
  forbidden: "Votre compte n'est pas autorisé à utiliser l'IA.",
  invalid_request: "L'idée n'a pas pu être envoyée au modèle (contenu invalide ou trop long).",
  model_error: "Le modèle n'a pas pu proposer de note. Réessayez ou notez l'idée manuellement.",
};

export interface HttpAiScoringProviderOptions {
  endpoint?: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export class HttpAiScoringProvider implements AiScoringProvider {
  readonly id = 'http';
  readonly label = 'Modèle de langage (via le serveur)';
  readonly simulated = false;
  private readonly endpoint: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpAiScoringProviderOptions) {
    this.endpoint = options.endpoint ?? '/api/score';
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async suggest(idea: Idea): Promise<AiSuggestion> {
    const token = await this.getAccessToken();
    if (!token) throw new AiProviderError(MESSAGES.unauthenticated!, 'unauthenticated');

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(toScoringInput(idea)),
      });
    } catch {
      throw new AiProviderError('Le serveur IA est injoignable. Vérifiez votre connexion.', 'network');
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'object' && payload.error !== null && 'code' in payload.error
          ? String(payload.error.code)
          : 'model_error';
      throw new AiProviderError(MESSAGES[code] ?? MESSAGES.model_error!, code);
    }
    const suggestion =
      typeof payload === 'object' && payload !== null && 'suggestion' in payload ? parseAiSuggestionPayload(payload.suggestion, idea.id) : null;
    if (!suggestion) throw new AiProviderError('Réponse du serveur IA invalide.', 'invalid_response');
    return suggestion;
  }
}
