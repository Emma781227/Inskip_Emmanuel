import Papa from 'papaparse';
import { averageScore, finalScore } from './scoring';
import { CRITERIA, CRITERION_LABELS, type AiSuggestion, type HumanEvaluation, type Idea, type WorkspaceState } from './types';

/** Taille indicative demandée par Camille (« environ 8 ») : jamais imposée. */
export const SHORTLIST_TARGET = 8;

export interface ShortlistRow {
  rank: number;
  idea: Idea;
  evaluation: HumanEvaluation | undefined;
  aiSuggestion: AiSuggestion | undefined;
  finalScore: number | null;
  selectedAt: string;
}

/** Idées sélectionnées, triées par score final décroissant (non évaluées en dernier), puis par date de sélection. */
export function buildShortlist(ideas: Idea[], state: WorkspaceState): ShortlistRow[] {
  const byId = new Map(ideas.map((idea) => [idea.id, idea]));
  return Object.values(state.shortlist)
    .flatMap((selection) => {
      const idea = byId.get(selection.ideaId);
      if (!idea) return [];
      const evaluation = state.evaluations[idea.id];
      return [{ idea, evaluation, aiSuggestion: state.aiSuggestions[idea.id], finalScore: finalScore(evaluation), selectedAt: selection.selectedAt }];
    })
    .sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1) || a.selectedAt.localeCompare(b.selectedAt))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export type ShortlistSizeStatus = 'empty' | 'below' | 'on-target' | 'above';

/** Indication souple autour de la cible : 6 à 10 idées est considéré « dans la cible ». */
export function shortlistSizeStatus(count: number, target: number = SHORTLIST_TARGET): ShortlistSizeStatus {
  if (count === 0) return 'empty';
  if (count < target - 2) return 'below';
  if (count > target + 2) return 'above';
  return 'on-target';
}

const formatNumber = (value: number | null) => (value === null ? '' : value.toLocaleString('fr-FR'));

/**
 * Export CSV de la shortlist pour le client : séparateur « ; » et BOM UTF-8 pour
 * une ouverture directe dans Excel en français. Ne contient que des notes validées
 * par Camille ; la synthèse IA est clairement étiquetée comme simulée.
 */
export function shortlistToCsv(rows: ShortlistRow[]): string {
  const data = rows.map((row) => {
    const scores = row.evaluation?.scores;
    const record: Record<string, string> = {
      Rang: String(row.rank),
      Identifiant: row.idea.id,
      Titre: row.idea.title,
      Porteur: `${row.idea.author.firstName} ${row.idea.author.lastName}`.trim(),
      Direction: row.idea.direction ?? '',
      Site: row.idea.site ?? '',
      Thème: row.idea.theme ?? '',
      Description: row.idea.description,
      'Bénéfices attendus': row.idea.expectedBenefits ?? '',
      'Budget estimé (saisi)': row.idea.budgetRaw,
    };
    for (const key of CRITERIA) record[CRITERION_LABELS[key]] = scores ? String(scores[key]) : '';
    record['Score final (/5)'] = formatNumber(scores ? averageScore(scores) : null);
    record['Commentaire de la consultante'] = row.evaluation?.comment ?? '';
    record['Synthèse IA'] = row.aiSuggestion?.summary ?? '';
    record['Source de la proposition IA'] = row.aiSuggestion ? (row.aiSuggestion.simulated ? 'Simulation (règles)' : row.aiSuggestion.provider) : '';
    return record;
  });
  return '﻿' + Papa.unparse(data, { delimiter: ';', newline: '\r\n' });
}
