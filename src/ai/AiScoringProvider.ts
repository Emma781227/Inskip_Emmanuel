import type { AiSuggestion, Idea } from '../domain/types';

/**
 * Contrat d'un fournisseur de notation « IA ».
 * L'interface utilisateur ne dépend que de ce contrat : remplacer la simulation par un
 * vrai modèle ne demande qu'une nouvelle implémentation (voir config.ts).
 */
export interface AiScoringProvider {
  readonly id: string;
  /** Libellé affiché à Camille. */
  readonly label: string;
  /** true tant que les notes ne viennent pas d'un vrai modèle. */
  readonly simulated: boolean;
  suggest(idea: Idea): Promise<AiSuggestion>;
}
