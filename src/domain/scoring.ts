import {
  CRITERIA,
  type EvaluationStatus,
  type HumanEvaluation,
  type Score,
  type ScoreCriteria,
  type WorkspaceState,
} from './types';

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

export function isValidScore(value: unknown): value is Score {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

/** Ramène une valeur quelconque dans l'intervalle 1–5 (entier). */
export function clampScore(value: number): Score {
  const rounded = Math.round(value);
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, rounded)) as Score;
}

/** Une grille partielle (formulaire en cours) est-elle complète et valide ? */
export function isCompleteCriteria(draft: Partial<Record<keyof ScoreCriteria, unknown>>): draft is ScoreCriteria {
  return CRITERIA.every((key) => isValidScore(draft[key]));
}

/** Moyenne arithmétique simple des quatre critères, arrondie à 0,1. */
export function averageScore(scores: ScoreCriteria): number {
  const sum = CRITERIA.reduce((total, key) => total + scores[key], 0);
  return Math.round((sum / CRITERIA.length) * 10) / 10;
}

/**
 * Score final d'une idée : uniquement la moyenne des notes validées par Camille.
 * Une suggestion IA seule ne produit jamais de score final.
 */
export function finalScore(evaluation: HumanEvaluation | undefined): number | null {
  return evaluation ? averageScore(evaluation.scores) : null;
}

export function evaluationStatus(state: WorkspaceState, ideaId: string): EvaluationStatus {
  if (state.evaluations[ideaId]) return 'evaluated';
  if (state.aiSuggestions[ideaId]) return 'ai-proposed';
  return 'todo';
}

export function formatScore(score: number | null): string {
  return score === null ? '—' : score.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
