import { describe, expect, it } from 'vitest';
import { MockAiScoringProvider, simulateSuggestion } from '../src/ai/MockAiScoringProvider';
import { parseIdeasCsv } from '../src/data/csv';
import { isValidScore } from '../src/domain/scoring';
import { CRITERIA } from '../src/domain/types';
import { HEXAVIA_CSV, makeIdea } from './fixtures';

const { ideas } = parseIdeasCsv(HEXAVIA_CSV);
const byId = new Map(ideas.map((idea) => [idea.id, idea]));
const now = new Date('2026-11-12T10:00:00Z');

describe('MockAiScoringProvider — simulation déterministe', () => {
  it('produit exactement le même résultat pour la même idée', () => {
    for (const idea of ideas) {
      expect(simulateSuggestion(idea, now)).toEqual(simulateSuggestion(idea, now));
    }
  });

  it('propose quatre notes entières de 1 à 5 et une justification par critère', () => {
    for (const idea of ideas) {
      const suggestion = simulateSuggestion(idea, now);
      for (const key of CRITERIA) {
        expect(isValidScore(suggestion.scores[key])).toBe(true);
        expect(suggestion.justifications[key].length).toBeGreaterThan(10);
      }
      expect(suggestion.summary).not.toBe('');
    }
  });

  it('se déclare comme une simulation', async () => {
    const provider = new MockAiScoringProvider();
    const suggestion = await provider.suggest(makeIdea());
    expect(provider.simulated).toBe(true);
    expect(suggestion.simulated).toBe(true);
    expect(suggestion.provider).toBe('mock-rules-v1');
  });

  it('signale les informations insuffisantes', () => {
    const chatbot = simulateSuggestion(byId.get('IDEA-019')!, now); // pas de bénéfices, pas de budget
    expect(chatbot.warnings).toEqual(expect.arrayContaining(['Bénéfices attendus non renseignés.', 'Budget absent ou non chiffré.']));
    expect(chatbot.summary).toMatch(/Informations insuffisantes/);

    const coffee = simulateSuggestion(byId.get('IDEA-015')!, now);
    expect(coffee.warnings).toContain('Thème non renseigné.');
    expect(simulateSuggestion(byId.get('IDEA-021')!, now).warnings.some((w) => w.includes('anglais'))).toBe(true);
  });

  it('n’alerte pas sur une idée complète', () => {
    expect(simulateSuggestion(makeIdea(), now).warnings).toEqual([]);
  });

  it('note la faisabilité à partir du budget annoncé', () => {
    expect(simulateSuggestion(makeIdea({ budgetEstimateEur: 5000 }), now).scores.feasibility).toBe(5);
    expect(simulateSuggestion(makeIdea({ budgetEstimateEur: 400000 }), now).scores.feasibility).toBe(1);
  });
});
