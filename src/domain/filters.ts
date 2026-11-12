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
  /** 'with' : idées ayant au moins un doublon potentiel ; 'without' : aucune. */
  duplicates: DuplicateFilter;
  sort: SortOption;
}

export type DuplicateFilter = '' | 'with' | 'without';

export const DUPLICATE_FILTER_LABELS: Record<Exclude<DuplicateFilter, ''>, string> = {
  with: 'Doublons potentiels',
  without: 'Sans doublon',
};

export const DEFAULT_FILTERS: IdeaFilters = { query: '', direction: '', theme: '', site: '', status: '', duplicates: '', sort: 'id' };

/** Valeur spéciale de filtre pour « champ non renseigné ». */
export const NOT_PROVIDED = '__none__';

function matchesField(value: string | null, filter: string): boolean {
  if (!filter) return true;
  if (filter === NOT_PROVIDED) return value === null;
  return value === filter;
}

/**
 * Filtre et trie les idées. `hasDuplicates` indique si une idée a au moins un doublon potentiel
 * (calculé par src/domain/duplicates) ; sans lui, le filtre « doublons » est ignoré.
 */
export function filterAndSortIdeas(
  ideas: Idea[],
  state: WorkspaceState,
  filters: IdeaFilters,
  hasDuplicates?: (ideaId: string) => boolean,
): Idea[] {
  const terms = normalizeText(filters.query).split(' ').filter(Boolean);
  const filtered = ideas.filter((idea) => {
    if (!matchesField(idea.direction, filters.direction)) return false;
    if (!matchesField(idea.theme, filters.theme)) return false;
    if (!matchesField(idea.site, filters.site)) return false;
    if (filters.status && evaluationStatus(state, idea.id) !== filters.status) return false;
    if (filters.duplicates && hasDuplicates && hasDuplicates(idea.id) !== (filters.duplicates === 'with')) return false;
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

/** Nombre d'idées par page dans le tableau. */
export const PAGE_SIZE = 15;

export interface Page<T> {
  items: T[];
  /** Page courante (1 = première), ramenée dans les bornes. */
  page: number;
  pageCount: number;
  /** Position (1-based) du premier et du dernier élément affichés ; 0 si la liste est vide. */
  from: number;
  to: number;
  total: number;
}

/** Découpe une liste en pages ; une page hors bornes (lien périmé, filtre plus restrictif) est corrigée. */
export function paginate<T>(items: T[], requestedPage: number, pageSize: number = PAGE_SIZE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isFinite(requestedPage) ? Math.min(pageCount, Math.max(1, Math.trunc(requestedPage))) : 1;
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { items: slice, page, pageCount, from: total === 0 ? 0 : start + 1, to: start + slice.length, total };
}
