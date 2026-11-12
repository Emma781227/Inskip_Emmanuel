/**
 * Persistance IdeaPilot. L'application ne dépend que de l'interface `IdeaPilotRepository` ;
 * l'implémentation est Supabase (Postgres + RLS). La logique métier reste dans src/domain.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSuggestion, HumanEvaluation, Idea, ScoreCriteria, ShortlistSelection, WorkspaceState } from '../domain/types';
import type { Database } from './database.types';
import {
  evaluationToRow,
  prepareIdeaImport,
  rowToEvaluation,
  rowToIdea,
  rowToShortlist,
  rowToSuggestion,
  suggestionToRow,
} from './mappers';

export interface IdeaPilotData {
  ideas: Idea[];
  workspace: WorkspaceState;
}

export interface IdeaPilotRepository {
  loadAll(): Promise<IdeaPilotData>;
  /** Import idempotent : upsert sur l'identifiant métier, ne touche jamais aux évaluations. */
  importIdeas(ideas: Idea[]): Promise<number>;
  saveAiSuggestions(suggestions: AiSuggestion[]): Promise<void>;
  saveEvaluation(ideaId: string, scores: ScoreCriteria, comment: string): Promise<HumanEvaluation>;
  deleteEvaluation(ideaId: string): Promise<void>;
  addToShortlist(ideaId: string): Promise<ShortlistSelection>;
  removeFromShortlist(ideaId: string): Promise<void>;
}

/** Erreur lisible par Camille ; le détail technique reste dans la console. */
export class RepositoryError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RepositoryError';
  }
}

function fail(action: string, error: { message: string; code?: string } | null): never {
  console.error(`[IdeaPilot] ${action}`, error);
  const denied = error?.code === '42501' || /row-level security|permission denied/i.test(error?.message ?? '');
  throw new RepositoryError(
    denied
      ? `${action} : accès refusé. Votre compte n'est peut-être pas autorisé à utiliser IdeaPilot.`
      : `${action} : le serveur n'a pas répondu correctement. Réessayez dans un instant.`,
    error,
  );
}

const IMPORT_BATCH_SIZE = 200;

export class SupabaseRepository implements IdeaPilotRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async loadAll(): Promise<IdeaPilotData> {
    const [ideas, suggestions, evaluations, shortlist] = await Promise.all([
      this.db.from('ideas').select('*').order('id'),
      this.db.from('ai_suggestions').select('*'),
      this.db.from('evaluations').select('*'),
      this.db.from('shortlist').select('*'),
    ]);
    if (ideas.error) fail('Chargement des idées', ideas.error);
    if (suggestions.error) fail('Chargement des propositions IA', suggestions.error);
    if (evaluations.error) fail('Chargement des évaluations', evaluations.error);
    if (shortlist.error) fail('Chargement de la shortlist', shortlist.error);

    const workspace: WorkspaceState = { aiSuggestions: {}, evaluations: {}, shortlist: {} };
    for (const row of suggestions.data) workspace.aiSuggestions[row.idea_id] = rowToSuggestion(row);
    for (const row of evaluations.data) workspace.evaluations[row.idea_id] = rowToEvaluation(row);
    for (const row of shortlist.data) workspace.shortlist[row.idea_id] = rowToShortlist(row);
    return { ideas: ideas.data.map(rowToIdea), workspace };
  }

  async importIdeas(ideas: Idea[]): Promise<number> {
    const rows = prepareIdeaImport(ideas);
    for (let start = 0; start < rows.length; start += IMPORT_BATCH_SIZE) {
      const { error } = await this.db.from('ideas').upsert(rows.slice(start, start + IMPORT_BATCH_SIZE), { onConflict: 'id' });
      if (error) fail('Import des idées', error);
    }
    return rows.length;
  }

  async saveAiSuggestions(suggestions: AiSuggestion[]): Promise<void> {
    if (suggestions.length === 0) return;
    const { error } = await this.db.from('ai_suggestions').upsert(suggestions.map(suggestionToRow), { onConflict: 'idea_id' });
    if (error) fail('Enregistrement des propositions IA', error);
  }

  async saveEvaluation(ideaId: string, scores: ScoreCriteria, comment: string): Promise<HumanEvaluation> {
    const { data, error } = await this.db
      .from('evaluations')
      .upsert(evaluationToRow(ideaId, scores, comment), { onConflict: 'idea_id' })
      .select()
      .single();
    if (error) fail('Enregistrement de l’évaluation', error);
    return rowToEvaluation(data);
  }

  async deleteEvaluation(ideaId: string): Promise<void> {
    const { error } = await this.db.from('evaluations').delete().eq('idea_id', ideaId);
    if (error) fail('Suppression de l’évaluation', error);
  }

  async addToShortlist(ideaId: string): Promise<ShortlistSelection> {
    const { data, error } = await this.db
      .from('shortlist')
      .upsert({ idea_id: ideaId }, { onConflict: 'idea_id', ignoreDuplicates: false })
      .select()
      .single();
    if (error) fail('Ajout à la shortlist', error);
    return rowToShortlist(data);
  }

  async removeFromShortlist(ideaId: string): Promise<void> {
    const { error } = await this.db.from('shortlist').delete().eq('idea_id', ideaId);
    if (error) fail('Retrait de la shortlist', error);
  }
}
