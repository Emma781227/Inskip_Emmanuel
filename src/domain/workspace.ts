/**
 * Transitions pures de l'état de travail. Chaque fonction renvoie un nouvel état
 * sans muter l'ancien. Règle clé : les suggestions IA et les évaluations de Camille
 * vivent dans deux tables distinctes ; aucune transition IA ne touche aux évaluations.
 */
import { isCompleteCriteria } from './scoring';
import type { AiSuggestion, ScoreCriteria, WorkspaceState } from './types';

export function recordAiSuggestion(state: WorkspaceState, suggestion: AiSuggestion): WorkspaceState {
  return { ...state, aiSuggestions: { ...state.aiSuggestions, [suggestion.ideaId]: suggestion } };
}

export function recordAiSuggestions(state: WorkspaceState, suggestions: AiSuggestion[]): WorkspaceState {
  return suggestions.reduce(recordAiSuggestion, state);
}

export class InvalidScoresError extends Error {
  constructor() {
    super('Chaque critère doit recevoir une note entière de 1 à 5.');
    this.name = 'InvalidScoresError';
  }
}

export function saveHumanEvaluation(
  state: WorkspaceState,
  ideaId: string,
  scores: Partial<Record<keyof ScoreCriteria, unknown>>,
  comment: string,
  now: Date = new Date(),
): WorkspaceState {
  if (!isCompleteCriteria(scores)) throw new InvalidScoresError();
  const clean: ScoreCriteria = {
    impact: scores.impact,
    feasibility: scores.feasibility,
    alignment: scores.alignment,
    innovation: scores.innovation,
  };
  return {
    ...state,
    evaluations: {
      ...state.evaluations,
      [ideaId]: { ideaId, scores: clean, comment: comment.trim(), updatedAt: now.toISOString() },
    },
  };
}

export function removeHumanEvaluation(state: WorkspaceState, ideaId: string): WorkspaceState {
  const { [ideaId]: _removed, ...evaluations } = state.evaluations;
  return { ...state, evaluations };
}

export function isShortlisted(state: WorkspaceState, ideaId: string): boolean {
  return ideaId in state.shortlist;
}

export function addToShortlist(state: WorkspaceState, ideaId: string, now: Date = new Date()): WorkspaceState {
  if (isShortlisted(state, ideaId)) return state;
  return { ...state, shortlist: { ...state.shortlist, [ideaId]: { ideaId, selectedAt: now.toISOString() } } };
}

export function removeFromShortlist(state: WorkspaceState, ideaId: string): WorkspaceState {
  if (!isShortlisted(state, ideaId)) return state;
  const { [ideaId]: _removed, ...shortlist } = state.shortlist;
  return { ...state, shortlist };
}

export function toggleShortlist(state: WorkspaceState, ideaId: string, now: Date = new Date()): WorkspaceState {
  return isShortlisted(state, ideaId) ? removeFromShortlist(state, ideaId) : addToShortlist(state, ideaId, now);
}
