import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Idea } from '../src/domain/types';

/** Export Hexavia tel que fourni (copie à l'identique dans data/, non servie par l'application). */
export const HEXAVIA_CSV = readFileSync(fileURLToPath(new URL('../data/idees_hexavia.csv', import.meta.url)), 'utf8');

export function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: 'IDEA-999',
    submittedAt: '2026-10-01',
    submittedAtRaw: '2026-10-01',
    author: { firstName: 'Test', lastName: 'Auteur' },
    direction: 'Production',
    site: 'Lyon',
    theme: 'Process',
    title: 'Idée de test',
    description: 'Une description suffisamment longue pour décrire le besoin, le contexte et la solution envisagée par le porteur.',
    expectedBenefits: 'Gain de 10 % de productivité',
    budgetRaw: '20 000 €',
    budgetEstimateEur: 20000,
    ...overrides,
  };
}
