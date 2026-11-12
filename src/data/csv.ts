import Papa from 'papaparse';
import { emptyToNull, parseBudget, parseSubmissionDate } from '../domain/normalize';
import type { Idea } from '../domain/types';

export const EXPECTED_COLUMNS = [
  'id',
  'date_depot',
  'prenom',
  'nom',
  'direction',
  'site',
  'theme',
  'titre',
  'description',
  'benefices_attendus',
  'budget_estime',
] as const;

type Column = (typeof EXPECTED_COLUMNS)[number];
type CsvRow = Partial<Record<Column, string>>;

export class CsvImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvImportError';
  }
}

export interface CsvImportResult {
  ideas: Idea[];
  /** Avertissements non bloquants (ligne ignorée, date illisible…). */
  warnings: string[];
}

/** Lit l'export du formulaire (séparateur « ; », BOM toléré) et le convertit en idées. */
export function parseIdeasCsv(text: string): CsvImportResult {
  const parsed = Papa.parse<CsvRow>(text.replace(/^﻿/, ''), {
    header: true,
    delimiter: ';',
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const headers = parsed.meta.fields ?? [];
  const missing = EXPECTED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new CsvImportError(
      `Le fichier ne correspond pas au format attendu. Colonnes manquantes : ${missing.join(', ')}. ` +
        'Vérifiez que le séparateur est le point-virgule.',
    );
  }

  const warnings: string[] = parsed.errors.map((error) =>
    error.row !== undefined ? `Ligne ${error.row + 2} : ${error.message}` : error.message,
  );
  const ideas: Idea[] = [];
  const seenIds = new Set<string>();

  parsed.data.forEach((row, index) => {
    const line = index + 2;
    const id = (row.id ?? '').trim();
    const title = (row.titre ?? '').trim();
    if (!id || !title) {
      warnings.push(`Ligne ${line} ignorée : identifiant ou titre manquant.`);
      return;
    }
    if (seenIds.has(id)) {
      warnings.push(`Ligne ${line} ignorée : identifiant ${id} déjà présent.`);
      return;
    }
    seenIds.add(id);

    const submittedAtRaw = (row.date_depot ?? '').trim();
    const submittedAt = parseSubmissionDate(submittedAtRaw);
    if (submittedAtRaw && !submittedAt) warnings.push(`${id} : date « ${submittedAtRaw} » non reconnue.`);

    const budgetRaw = (row.budget_estime ?? '').trim();
    ideas.push({
      id,
      submittedAt,
      submittedAtRaw,
      author: { firstName: (row.prenom ?? '').trim(), lastName: (row.nom ?? '').trim() },
      direction: emptyToNull(row.direction),
      site: emptyToNull(row.site),
      theme: emptyToNull(row.theme),
      title,
      description: (row.description ?? '').trim(),
      expectedBenefits: emptyToNull(row.benefices_attendus),
      budgetRaw,
      budgetEstimateEur: parseBudget(budgetRaw),
    });
  });

  if (ideas.length === 0) throw new CsvImportError('Le fichier ne contient aucune idée exploitable.');
  return { ideas, warnings };
}
