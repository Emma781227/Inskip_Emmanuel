/**
 * Conversion entre les lignes Supabase (snake_case) et le modèle métier.
 * Fonctions pures, testées sans base de données. Les lignes lues sont revalidées :
 * une note hors 1–5 venant de la base fait échouer la conversion plutôt que d'être affichée.
 */
import { isValidScore } from '../domain/scoring';
import { CRITERIA, type AiSuggestion, type CriterionKey, type HumanEvaluation, type Idea, type ScoreCriteria, type ShortlistSelection } from '../domain/types';
import type { AiSuggestionInsert, AiSuggestionRow, EvaluationInsert, EvaluationRow, IdeaInsert, IdeaRow, ShortlistRow } from './database.types';

export class InvalidRowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRowError';
  }
}

export function ideaToRow(idea: Idea): IdeaInsert {
  return {
    id: idea.id,
    submitted_at: idea.submittedAt,
    submitted_at_raw: idea.submittedAtRaw,
    author_first_name: idea.author.firstName,
    author_last_name: idea.author.lastName,
    direction: idea.direction,
    site: idea.site,
    theme: idea.theme,
    title: idea.title,
    description: idea.description,
    expected_benefits: idea.expectedBenefits,
    budget_raw: idea.budgetRaw,
    budget_estimate_eur: idea.budgetEstimateEur,
  };
}

export function rowToIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    submittedAt: row.submitted_at,
    submittedAtRaw: row.submitted_at_raw,
    author: { firstName: row.author_first_name, lastName: row.author_last_name },
    direction: row.direction,
    site: row.site,
    theme: row.theme,
    title: row.title,
    description: row.description,
    expectedBenefits: row.expected_benefits,
    budgetRaw: row.budget_raw,
    budgetEstimateEur: row.budget_estimate_eur,
  };
}

/**
 * Prépare l'import : une ligne par identifiant (la dernière occurrence l'emporte),
 * pour qu'un upsert sur `id` soit idempotent et ne crée jamais de doublon.
 */
export function prepareIdeaImport(ideas: Idea[]): IdeaInsert[] {
  const byId = new Map<string, IdeaInsert>();
  for (const idea of ideas) byId.set(idea.id, ideaToRow(idea));
  return [...byId.values()];
}

function readScores(row: Record<CriterionKey, number>, context: string): ScoreCriteria {
  const scores = {} as ScoreCriteria;
  for (const key of CRITERIA) {
    const value = row[key];
    if (!isValidScore(value)) throw new InvalidRowError(`${context} : note « ${key} » invalide (${String(value)}).`);
    scores[key] = value;
  }
  return scores;
}

export function suggestionToRow(suggestion: AiSuggestion): AiSuggestionInsert {
  return {
    idea_id: suggestion.ideaId,
    ...suggestion.scores,
    justifications: { ...suggestion.justifications },
    summary: suggestion.summary,
    warnings: [...suggestion.warnings],
    provider: suggestion.provider,
    simulated: suggestion.simulated,
    generated_at: suggestion.generatedAt,
  };
}

export function rowToSuggestion(row: AiSuggestionRow): AiSuggestion {
  const justifications = {} as Record<CriterionKey, string>;
  for (const key of CRITERIA) justifications[key] = typeof row.justifications[key] === 'string' ? row.justifications[key] : '';
  return {
    ideaId: row.idea_id,
    scores: readScores(row, `Proposition IA ${row.idea_id}`),
    justifications,
    summary: row.summary,
    warnings: row.warnings,
    provider: row.provider,
    simulated: row.simulated,
    generatedAt: row.generated_at,
  };
}

export function evaluationToRow(ideaId: string, scores: ScoreCriteria, comment: string): EvaluationInsert {
  return { idea_id: ideaId, ...scores, comment: comment.trim() };
}

export function rowToEvaluation(row: EvaluationRow): HumanEvaluation {
  return {
    ideaId: row.idea_id,
    scores: readScores(row, `Évaluation ${row.idea_id}`),
    comment: row.comment,
    updatedAt: row.updated_at,
  };
}

export function rowToShortlist(row: ShortlistRow): ShortlistSelection {
  return { ideaId: row.idea_id, selectedAt: row.selected_at };
}
