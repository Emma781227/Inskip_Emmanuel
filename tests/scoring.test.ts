import { describe, expect, it } from 'vitest';
import { simulateSuggestion } from '../src/ai/MockAiScoringProvider';
import { averageScore, clampScore, evaluationStatus, finalScore, isCompleteCriteria, isValidScore } from '../src/domain/scoring';
import { emptyWorkspace } from '../src/domain/types';
import { InvalidScoresError, recordAiSuggestion, removeHumanEvaluation, saveHumanEvaluation } from '../src/domain/workspace';
import { makeIdea } from './fixtures';

describe('calcul du score', () => {
  it('fait la moyenne arithmétique simple des 4 critères, arrondie à 0,1', () => {
    expect(averageScore({ impact: 5, feasibility: 4, alignment: 3, innovation: 2 })).toBe(3.5);
    expect(averageScore({ impact: 2, feasibility: 2, alignment: 3, innovation: 5 })).toBe(3);
    expect(averageScore({ impact: 4, feasibility: 4, alignment: 4, innovation: 5 })).toBe(4.3);
  });

  it('valide uniquement les entiers de 1 à 5', () => {
    expect([1, 2, 3, 4, 5].every(isValidScore)).toBe(true);
    expect([0, 6, 2.5, -1, Number.NaN, '3', null, undefined].some(isValidScore)).toBe(false);
    expect(clampScore(9)).toBe(5);
    expect(clampScore(-2)).toBe(1);
  });

  it('exige les 4 critères pour une grille complète', () => {
    expect(isCompleteCriteria({ impact: 3, feasibility: 3, alignment: 3 })).toBe(false);
    expect(isCompleteCriteria({ impact: 3, feasibility: 3, alignment: 3, innovation: 3 })).toBe(true);
  });
});

describe('évaluation humaine vs suggestion IA', () => {
  const idea = makeIdea();
  const now = new Date('2026-11-12T10:00:00Z');
  const twos = { impact: 2, feasibility: 2, alignment: 2, innovation: 2 } as const;

  it('refuse une note hors de 1–5 ou un critère manquant', () => {
    expect(() => saveHumanEvaluation(emptyWorkspace(), idea.id, { ...twos, impact: 6 }, '')).toThrow(InvalidScoresError);
    expect(() => saveHumanEvaluation(emptyWorkspace(), idea.id, { impact: 3, feasibility: 3, alignment: 3 }, '')).toThrow(InvalidScoresError);
  });

  it('une suggestion IA seule ne donne pas de score final', () => {
    const state = recordAiSuggestion(emptyWorkspace(), simulateSuggestion(idea, now));
    expect(evaluationStatus(state, idea.id)).toBe('ai-proposed');
    expect(finalScore(state.evaluations[idea.id])).toBeNull();
  });

  it('conserve séparément les notes IA, les notes validées, la justification et la date', () => {
    const suggestion = simulateSuggestion(idea, now);
    let state = recordAiSuggestion(emptyWorkspace(), suggestion);
    state = saveHumanEvaluation(state, idea.id, { impact: 1, feasibility: 1, alignment: 1, innovation: 1 }, '  Trop flou  ', now);
    expect(state.aiSuggestions[idea.id]).toEqual(suggestion);
    expect(state.evaluations[idea.id]).toEqual({
      ideaId: idea.id,
      scores: { impact: 1, feasibility: 1, alignment: 1, innovation: 1 },
      comment: 'Trop flou',
      updatedAt: now.toISOString(),
    });
    expect(evaluationStatus(state, idea.id)).toBe('evaluated');
  });

  it('relancer l’IA après correction ne modifie pas l’évaluation de la consultante', () => {
    let state = saveHumanEvaluation(emptyWorkspace(), idea.id, twos, 'Mon avis', now);
    const before = state.evaluations[idea.id];
    state = recordAiSuggestion(state, simulateSuggestion(idea, new Date('2026-11-13T10:00:00Z')));
    expect(state.evaluations[idea.id]).toBe(before);
    expect(finalScore(state.evaluations[idea.id])).toBe(2);
  });

  it('effacer l’évaluation conserve la suggestion IA', () => {
    let state = recordAiSuggestion(emptyWorkspace(), simulateSuggestion(idea, now));
    state = saveHumanEvaluation(state, idea.id, twos, '', now);
    state = removeHumanEvaluation(state, idea.id);
    expect(state.evaluations[idea.id]).toBeUndefined();
    expect(state.aiSuggestions[idea.id]).toBeDefined();
  });

  it('ne mute jamais l’état précédent', () => {
    const initial = emptyWorkspace();
    saveHumanEvaluation(initial, idea.id, twos, '', now);
    expect(initial.evaluations).toEqual({});
  });
});
