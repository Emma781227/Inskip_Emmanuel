import { describe, expect, it } from 'vitest';
import { parseIdeasCsv } from '../src/data/csv';
import { DEFAULT_FILTERS, NOT_PROVIDED, filterAndSortIdeas } from '../src/domain/filters';
import { emptyWorkspace } from '../src/domain/types';
import { saveHumanEvaluation } from '../src/domain/workspace';
import { HEXAVIA_CSV } from './fixtures';

describe('filtres et tris du tableau', () => {
  const { ideas } = parseIdeasCsv(HEXAVIA_CSV);
  const state = emptyWorkspace();

  it('recherche dans le titre et la description, sans tenir compte des accents', () => {
    const ids = filterAndSortIdeas(ideas, state, { ...DEFAULT_FILTERS, query: 'COMPRESSEUR' }).map((idea) => idea.id);
    expect(ids).toEqual(['IDEA-001', 'IDEA-007']);
    expect(filterAndSortIdeas(ideas, state, { ...DEFAULT_FILTERS, query: 'recuperation chaleur' }).map((idea) => idea.id)).toEqual(['IDEA-006']);
    expect(filterAndSortIdeas(ideas, state, { ...DEFAULT_FILTERS, query: 'introuvable xyz' })).toEqual([]);
  });

  it('filtre par direction, thème et site, y compris « non renseigné »', () => {
    expect(filterAndSortIdeas(ideas, state, { ...DEFAULT_FILTERS, direction: 'RH' }).every((idea) => idea.direction === 'RH')).toBe(true);
    expect(filterAndSortIdeas(ideas, state, { ...DEFAULT_FILTERS, theme: NOT_PROVIDED }).map((idea) => idea.id)).toEqual(['IDEA-015', 'IDEA-029']);
    expect(filterAndSortIdeas(ideas, state, { ...DEFAULT_FILTERS, site: NOT_PROVIDED }).map((idea) => idea.id)).toEqual(['IDEA-040']);
  });

  it('trie par score (non évaluées en bas) et par date', () => {
    let scored = saveHumanEvaluation(state, 'IDEA-030', { impact: 5, feasibility: 5, alignment: 5, innovation: 5 }, '');
    scored = saveHumanEvaluation(scored, 'IDEA-010', { impact: 1, feasibility: 1, alignment: 1, innovation: 1 }, '');
    const desc = filterAndSortIdeas(ideas, scored, { ...DEFAULT_FILTERS, sort: 'score-desc' });
    expect(desc.slice(0, 2).map((idea) => idea.id)).toEqual(['IDEA-030', 'IDEA-010']);
    const asc = filterAndSortIdeas(ideas, scored, { ...DEFAULT_FILTERS, sort: 'score-asc' });
    expect(asc.slice(0, 2).map((idea) => idea.id)).toEqual(['IDEA-010', 'IDEA-030']);
    const recent = filterAndSortIdeas(ideas, state, { ...DEFAULT_FILTERS, sort: 'date-desc' });
    expect(recent[0]!.submittedAt).toBe('2026-10-12');
  });

  it('filtre par statut d’évaluation', () => {
    const scored = saveHumanEvaluation(state, 'IDEA-030', { impact: 5, feasibility: 5, alignment: 5, innovation: 5 }, '');
    expect(filterAndSortIdeas(ideas, scored, { ...DEFAULT_FILTERS, status: 'evaluated' }).map((idea) => idea.id)).toEqual(['IDEA-030']);
    expect(filterAndSortIdeas(ideas, scored, { ...DEFAULT_FILTERS, status: 'todo' })).toHaveLength(39);
  });
});
