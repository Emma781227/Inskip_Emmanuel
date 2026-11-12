import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { parseIdeasCsv } from '../src/data/csv';
import { buildShortlist, shortlistSizeStatus, shortlistToCsv } from '../src/domain/shortlist';
import { emptyWorkspace } from '../src/domain/types';
import { addToShortlist, isShortlisted, removeFromShortlist, saveHumanEvaluation, toggleShortlist } from '../src/domain/workspace';
import { HEXAVIA_CSV } from './fixtures';

const { ideas } = parseIdeasCsv(HEXAVIA_CSV);
const now = new Date('2026-11-12T10:00:00Z');

describe('sélection de la shortlist', () => {
  it('sélectionne et désélectionne une idée', () => {
    let state = addToShortlist(emptyWorkspace(), 'IDEA-001', now);
    expect(isShortlisted(state, 'IDEA-001')).toBe(true);
    expect(state.shortlist['IDEA-001']).toEqual({ ideaId: 'IDEA-001', selectedAt: now.toISOString() });
    state = removeFromShortlist(state, 'IDEA-001');
    expect(isShortlisted(state, 'IDEA-001')).toBe(false);
  });

  it('bascule avec toggle et reste idempotent', () => {
    let state = toggleShortlist(emptyWorkspace(), 'IDEA-002', now);
    expect(addToShortlist(state, 'IDEA-002')).toBe(state);
    state = toggleShortlist(state, 'IDEA-002');
    expect(state.shortlist).toEqual({});
  });

  it('n’impose pas 8 idées : indication souple autour de la cible', () => {
    expect(shortlistSizeStatus(0)).toBe('empty');
    expect(shortlistSizeStatus(3)).toBe('below');
    expect(shortlistSizeStatus(7)).toBe('on-target');
    expect(shortlistSizeStatus(9)).toBe('on-target');
    expect(shortlistSizeStatus(12)).toBe('above');
  });

  it('classe par score final décroissant, les idées non évaluées en dernier', () => {
    let state = emptyWorkspace();
    for (const id of ['IDEA-005', 'IDEA-001', 'IDEA-020']) state = addToShortlist(state, id, now);
    state = saveHumanEvaluation(state, 'IDEA-001', { impact: 3, feasibility: 3, alignment: 3, innovation: 3 }, '', now);
    state = saveHumanEvaluation(state, 'IDEA-020', { impact: 5, feasibility: 5, alignment: 4, innovation: 4 }, '', now);
    const rows = buildShortlist(ideas, state);
    expect(rows.map((row) => [row.rank, row.idea.id, row.finalScore])).toEqual([
      [1, 'IDEA-020', 4.5],
      [2, 'IDEA-001', 3],
      [3, 'IDEA-005', null],
    ]);
  });
});

describe('export CSV de la shortlist', () => {
  let state = emptyWorkspace();
  state = addToShortlist(state, 'IDEA-023', now);
  state = addToShortlist(state, 'IDEA-020', now);
  state = saveHumanEvaluation(state, 'IDEA-023', { impact: 5, feasibility: 3, alignment: 5, innovation: 4 }, 'Porteur motivé; à rencontrer', now);
  const csv = shortlistToCsv(buildShortlist(ideas, state));
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ''), { header: true, delimiter: ';' });

  it('est lisible par Excel FR : BOM UTF-8 et séparateur « ; »', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(parsed.meta.delimiter).toBe(';');
    expect(parsed.errors).toEqual([]);
  });

  it('contient uniquement les idées sélectionnées, dans l’ordre du classement', () => {
    expect(parsed.data.map((row) => row.Identifiant)).toEqual(['IDEA-023', 'IDEA-020']);
  });

  it('exporte notes, score final (virgule décimale), commentaire et budget d’origine', () => {
    const first = parsed.data[0]!;
    expect(first["Impact pour l'entreprise"]).toBe('5');
    expect(first['Score final (/5)']).toBe('4,3');
    expect(first['Commentaire de la consultante']).toBe('Porteur motivé; à rencontrer');
    expect(first['Budget estimé (saisi)']).toBe('80 000 € (déplacement des machines et formation)');
    expect(parsed.data[1]!['Score final (/5)']).toBe('');
  });
});
