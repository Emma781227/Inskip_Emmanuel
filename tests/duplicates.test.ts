import { describe, expect, it } from 'vitest';
import { parseIdeasCsv } from '../src/data/csv';
import { findDuplicatePairs, indexDuplicates, jaccard, tokenize } from '../src/domain/duplicates';
import { HEXAVIA_CSV, makeIdea } from './fixtures';

const { ideas } = parseIdeasCsv(HEXAVIA_CSV);
const pairs = findDuplicatePairs(ideas);
const pairKeys = pairs.map((pair) => `${pair.ideaId}/${pair.otherIdeaId}`);

describe('tokenisation et Jaccard', () => {
  it('normalise accents, casse, ponctuation et retire les mots vides', () => {
    expect([...tokenize("L'Assistant IA pour les QUESTIONS RH !")]).toEqual(['assist', 'ia', 'questi', 'rh']);
  });

  it('ramène pluriels et synonymes courants à une même forme', () => {
    expect(tokenize('compresseurs pannes')).toEqual(tokenize('compresseur panne'));
    expect(tokenize('chatbot')).toEqual(tokenize('assistant'));
  });

  it('calcule la similarité de Jaccard', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
});

describe('détection des doublons sur l’export Hexavia', () => {
  it('signale les titres identiques avec une similarité de 100 %', () => {
    const exact = pairs.find((pair) => pair.ideaId === 'IDEA-002' && pair.otherIdeaId === 'IDEA-014');
    expect(exact).toMatchObject({ similarity: 1, reason: 'identical-title' });
  });

  it('signale les reformulations évidentes', () => {
    expect(pairKeys).toContain('IDEA-003/IDEA-019'); // assistant IA RH / chatbot RH
    expect(pairKeys).toContain('IDEA-001/IDEA-007'); // capteurs compresseurs / maintenance prédictive compresseurs
  });

  it('ne rapproche pas des idées différentes qui partagent un mot', () => {
    expect(pairKeys).not.toContain('IDEA-008/IDEA-038'); // covoiturage / formation IA (« salariés »)
    expect(pairKeys).not.toContain('IDEA-009/IDEA-028'); // fiches de poste / poste de chargement
    expect(pairKeys).not.toContain('IDEA-006/IDEA-025'); // chaleur des fours / ombrières solaires
    expect(pairKeys).not.toContain('IDEA-005/IDEA-016'); // portail client / devis en ligne
  });

  it('reste sobre : moins de 10 paires signalées sur 40 idées', () => {
    expect(pairs.length).toBeLessThan(10);
  });

  it('indexe chaque paire dans les deux sens', () => {
    const index = indexDuplicates(pairs);
    expect(index.get('IDEA-014')?.[0]).toMatchObject({ otherIdeaId: 'IDEA-002', similarity: 1 });
    expect(index.get('IDEA-002')?.[0]).toMatchObject({ otherIdeaId: 'IDEA-014' });
  });

  it('détecte un titre identique malgré casse, accents et ponctuation', () => {
    const a = makeIdea({ id: 'A', title: 'Récupération de chaleur', description: 'x' });
    const b = makeIdea({ id: 'B', title: 'RECUPERATION DE CHALEUR !', description: 'y' });
    expect(findDuplicatePairs([a, b])).toEqual([{ ideaId: 'A', otherIdeaId: 'B', similarity: 1, reason: 'identical-title' }]);
  });

  it('ne fusionne ni ne retire aucune idée', () => {
    const copy = [...ideas];
    findDuplicatePairs(copy);
    expect(copy).toHaveLength(40);
  });
});
