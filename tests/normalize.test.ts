import { describe, expect, it } from 'vitest';
import { normalizeText, parseBudget, parseSubmissionDate } from '../src/domain/normalize';

describe('parseBudget — budgets saisis librement', () => {
  it.each([
    ['40 000 €', 40000],
    ['15k€', 15000],
    ['35k', 35000],
    ['30 000 euros', 30000],
    ['0', 0],
    ['0 €', 0],
    ['80 000 € (déplacement des machines et formation)', 80000],
    ['20 k€', 20000],
    ['1,5 M€', 1500000],
    ['40 000 €', 40000],
  ])('%s → %d', (raw, expected) => {
    expect(parseBudget(raw)).toBe(expected);
  });

  it.each(['', '?', 'à définir'])('« %s » → null (non chiffrable)', (raw) => {
    expect(parseBudget(raw)).toBeNull();
  });
});

describe('parseSubmissionDate', () => {
  it('accepte ISO et JJ/MM/AAAA', () => {
    expect(parseSubmissionDate('2026-09-15')).toBe('2026-09-15');
    expect(parseSubmissionDate('03/10/2026')).toBe('2026-10-03');
  });

  it('rejette les dates invalides', () => {
    expect(parseSubmissionDate('31/02/2026')).toBeNull();
    expect(parseSubmissionDate('hier')).toBeNull();
    expect(parseSubmissionDate('')).toBeNull();
  });
});

describe('normalizeText', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalizeText("  Récupération de l'ÉNERGIE ! ")).toBe('recuperation de l energie');
  });
});
