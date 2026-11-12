import { normalizeText } from './normalize';
import { evaluationStatus, finalScore } from './scoring';
import type { EvaluationStatus, Idea, WorkspaceState } from './types';

export type SortOption = 'date-desc' | 'date-asc' | 'score-desc' | 'score-asc' | 'id';

export const SORT_LABELS: Record<SortOption, string> = {
  id: 'Numéro',
  'date-desc': 'Date de dépôt (récentes)',
  'date-asc': 'Date de dépôt (anciennes)',
  'score-desc': 'Score (meilleurs)',
  'score-asc': 'Score (plus faibles)',
};

export interface IdeaFilters {
  query: string;
  direction: string;
  theme: string;
  site: string;
  status: EvaluationStatus | '';
  sort: SortOption;
}

export const DEFAULT_FILTERS: IdeaFilters = { query: '', direction: '', theme: '', site: '', status: '', sort: 'id' };

/** Valeur spéciale de filtre pour « champ non renseigné ». */
export const NOT_PROVIDED = '__none__';

function matchesField(value: string | null, filter: string): boolean {
  if (!filter) return true;
  if (filter === NOT_PROVIDED) return value === null;
  return value === filter;
}

export function filterAndSortIdeas(ideas: Idea[], state: WorkspaceState, filters: IdeaFilters): Idea[] {
  const terms = normalizeText(filters.query).split(' ').filter(Boolean);
  const filtered = ideas.filter((idea) => {
    if (!matchesField(idea.direction, filters.direction)) return false;
    if (!matchesField(idea.theme, filters.theme)) return false;
    if (!matchesField(idea.site, filters.site)) return false;
    if (filters.status && evaluationStatus(state, idea.id) !== filters.status) return false;
    if (terms.length === 0) return true;
    const haystack = normalizeText(`${idea.id} ${idea.title} ${idea.description}`);
    return terms.every((term) => haystack.includes(term));
  });

  const score = (idea: Idea) => finalScore(state.evaluations[idea.id]);
  const date = (idea: Idea) => idea.submittedAt ?? '';
  const compareScore = (a: Idea, b: Idea, direction: 1 | -1) => {
    const sa = score(a);
    const sb = score(b);
    if (sa === null && sb === null) return a.id.localeCompare(b.id);
    if (sa === null) return 1; // les idées non évaluées restent en bas, quel que soit le sens
    if (sb === null) return -1;
    return (sa - sb) * direction || a.id.localeCompare(b.id);
  };

  return [...filtered].sort((a, b) => {
    switch (filters.sort) {
      case 'score-desc':
        return compareScore(a, b, -1);
      case 'score-asc':
        return compareScore(a, b, 1);
      case 'date-desc':
        return date(b).localeCompare(date(a)) || a.id.localeCompare(b.id);
      case 'date-asc':
        return date(a).localeCompare(date(b)) || a.id.localeCompare(b.id);
      case 'id':
        return a.id.localeCompare(b.id);
    }
  });
}

/** Valeurs distinctes d'un champ, triées, pour alimenter les listes de filtres. */
export function distinctValues(ideas: Idea[], pick: (idea: Idea) => string | null): { values: string[]; hasMissing: boolean } {
  const values = new Set<string>();
  let hasMissing = false;
  for (const idea of ideas) {
    const value = pick(idea);
    if (value === null) hasMissing = true;
    else values.add(value);
  }
  return { values: [...values].sort((a, b) => a.localeCompare(b, 'fr')), hasMissing };
}
