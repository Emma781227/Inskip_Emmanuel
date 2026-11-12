/**
 * Choix du fournisseur de notation (variable publique VITE_AI_PROVIDER) :
 *  - "mock" (défaut) : simulation déterministe à base de règles, aucune donnée ne sort ;
 *  - "http" : vrai modèle via la fonction serveur /api/score (api/score.ts), qui détient
 *    la clé ANTHROPIC_API_KEY. Tant que cette clé n'est pas définie côté serveur, l'appel
 *    échoue proprement (« IA pas encore activée ») et la saisie manuelle reste possible.
 * Aucune clé de modèle ne transite par le navigateur : rien de secret n'est préfixé VITE_.
 */
import type { AiScoringProvider } from './AiScoringProvider';
import { HttpAiScoringProvider } from './HttpAiScoringProvider';
import { MockAiScoringProvider } from './MockAiScoringProvider';

export type AiProviderName = 'mock' | 'http';

export function resolveAiProviderName(value: string | undefined): AiProviderName {
  const name = value?.trim().toLowerCase();
  if (!name || name === 'mock') return 'mock';
  if (name === 'http') return 'http';
  console.warn(`Fournisseur IA « ${value} » inconnu : utilisation de la simulation.`);
  return 'mock';
}

export interface AiProviderDeps {
  /** Jeton de session de l'utilisateur connecté (requis pour le fournisseur http). */
  getAccessToken: () => Promise<string | null>;
}

export function createAiProvider(name: AiProviderName, deps: AiProviderDeps): AiScoringProvider {
  switch (name) {
    case 'mock':
      return new MockAiScoringProvider(350);
    case 'http':
      return new HttpAiScoringProvider({ getAccessToken: deps.getAccessToken });
  }
}
