import { describe, expect, it } from 'vitest';
import { parseIdeasCsv } from '../src/data/csv';
import { findDuplicatePairs, indexDuplicates } from '../src/domain/duplicates';
import { DEFAULT_FILTERS, NOT_PROVIDED, PAGE_SIZE, filterAndSortIdeas, paginate } from '../src/domain/filters';
import { emptyWorkspace } from '../src/domain/types';
import { saveHumanEvaluation } from '../src/domain/workspace';
import { HEXAVIA_CSV } from './fixtures';

describe('pagination', () => {
  const items = Array.from({ length: 40 }, (_, i) => i + 1);

  it('affiche 15 idées par page : 40 idées = 3 pages (15, 15, 10)', () => {
    expect(PAGE_SIZE).toBe(15);
    expect(paginate(items, 1)).toMatchObject({ page: 1, pageCount: 3, from: 1, to: 15, total: 40 });
    expect(paginate(items, 2).items).toEqual(items.slice(15, 30));
    expect(paginate(items, 3)).toMatchObject({ from: 31, to: 40 });
    expect(paginate(items, 3).items).toHaveLength(10);
  });

  it('ramène une page hors bornes ou invalide dans les limites', () => {
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate(items, Number('abc')).page).toBe(1);
    expect(paginate(items, 2.7).page).toBe(2);
  });

  it('gère une liste vide et une liste plus courte qu’une page', () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
    expect(paginate([1, 2, 3], 1)).toMatchObject({ pageCount: 1, from: 1, to: 3 });
  });

  it('passe à l’échelle : 1 000 idées = 67 pages', () => {
    const many = Array.from({ length: 1000 }, (_, i) => i);
    expect(paginate(many, 67)).toMatchObject({ pageCount: 67, from: 991, to: 1000 });
  });
});

describe('filtre des doublons', () => {
  const { ideas } = parseIdeasCsv(HEXAVIA_CSV);
  const index = indexDuplicates(findDuplicatePairs(ideas));
  const hasDuplicates = (id: string) => (index.get(id)?.length ?? 0) > 0;

  it('ne garde que les idées ayant un doublon potentiel', () => {
    const ids = filterAndSortIdeas(ideas, emptyWorkspace(), { ...DEFAULT_FILTERS, duplicates: 'with' }, hasDuplicates).map((idea) => idea.id);
    expect(ids).toEqual(['IDEA-001', 'IDEA-002', 'IDEA-003', 'IDEA-007', 'IDEA-008', 'IDEA-014', 'IDEA-019', 'IDEA-027']);
  });

  it('« sans doublon » donne le complément exact', () => {
    const without = filterAndSortIdeas(ideas, emptyWorkspace(), { ...DEFAULT_FILTERS, duplicates: 'without' }, hasDuplicates);
    expect(without).toHaveLength(32);
    expect(without.some((idea) => hasDuplicates(idea.id))).toBe(false);
  });

  it('se combine avec les autres filtres', () => {
    const ids = filterAndSortIdeas(ideas, emptyWorkspace(), { ...DEFAULT_FILTERS, duplicates: 'with', direction: 'RH' }, hasDuplicates).map((idea) => idea.id);
    expect(ids).toEqual(['IDEA-003', 'IDEA-019']);
  });
});

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
