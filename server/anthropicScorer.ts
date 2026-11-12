/**
 * Notation par Claude (API Messages, SDK officiel). Utilisé uniquement côté serveur.
 * Non actif en V1 : il faut définir ANTHROPIC_API_KEY dans les variables d'environnement
 * Vercel (jamais avec le préfixe VITE_, qui l'exposerait au navigateur).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { buildScoringUserMessage, SCORING_SYSTEM_PROMPT, type ModelScoring, type ScoringInput } from '../src/ai/scoringPrompt.js';

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';

const criterion = z.object({
  score: z.number().int().min(1).max(5),
  justification: z.string(),
});

/** Schéma de sortie imposé au modèle (structured outputs) ; reflète `ModelScoring`. */
export const ModelScoringSchema = z.object({
  criteria: z.object({
    impact: criterion,
    feasibility: criterion,
    alignment: criterion,
    innovation: criterion,
  }),
  summary: z.string(),
  warnings: z.array(z.string()),
});

export function createAnthropicScorer(apiKey: string, model: string = DEFAULT_AI_MODEL): (input: ScoringInput) => Promise<ModelScoring> {
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });

  return async (input) => {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // Si le modèle principal décline la demande, l'API bascule elle-même sur un modèle de repli.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: betaZodOutputFormat(ModelScoringSchema),
      },
      system: SCORING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildScoringUserMessage(input) }],
    });

    if (response.stop_reason === 'refusal') throw new Error('Le modèle a refusé de noter cette idée.');
    if (response.stop_reason === 'max_tokens') throw new Error('Réponse du modèle tronquée.');
    if (!response.parsed_output) throw new Error('Réponse du modèle non conforme au schéma attendu.');
    return response.parsed_output;
  };
}
