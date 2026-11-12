/**
 * Choix du fournisseur de notation.
 *
 * V1 : seule la simulation est disponible (le brief interdit les vraies clés API).
 * Pour brancher un vrai modèle plus tard :
 *  1. créer une fonction serveur (ex. `api/score.ts` sur Vercel) qui lit `AI_API_KEY`
 *     dans les variables d'environnement serveur et appelle le modèle ;
 *  2. implémenter un `HttpAiScoringProvider` qui appelle cette route ;
 *  3. le sélectionner ici via `VITE_AI_PROVIDER=http`.
 * La clé ne transite jamais par le navigateur : rien de secret ne doit être préfixé `VITE_`.
 */
import type { AiScoringProvider } from './AiScoringProvider';
import { MockAiScoringProvider } from './MockAiScoringProvider';

export type AiProviderName = 'mock';

export function resolveAiProviderName(value: string | undefined): AiProviderName {
  if (value && value !== 'mock') {
    console.warn(`Fournisseur IA « ${value} » non disponible en V1 : utilisation de la simulation.`);
  }
  return 'mock';
}

export function createAiProvider(name: AiProviderName = resolveAiProviderName(import.meta.env.VITE_AI_PROVIDER)): AiScoringProvider {
  switch (name) {
    case 'mock':
      return new MockAiScoringProvider(350);
  }
}
