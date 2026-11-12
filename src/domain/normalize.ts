/** Utilitaires de normalisation de texte et de valeurs saisies librement. */

/** Minuscule, sans accents, ponctuation remplacée par des espaces, espaces compactés. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Chaîne nettoyée, ou null si vide. */
export function emptyToNull(value: string | undefined | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Convertit une date du formulaire en ISO (AAAA-MM-JJ).
 * Formats acceptés : AAAA-MM-JJ et JJ/MM/AAAA (format français, présent dans l'export).
 */
export function parseSubmissionDate(raw: string): string | null {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  let y: number, m: number, d: number;
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (fr) {
    [d, m, y] = [Number(fr[1]), Number(fr[2]), Number(fr[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Extrait un montant en euros d'un budget saisi librement.
 * Exemples : "40 000 €" → 40000, "15k€" → 15000, "35k" → 35000, "30 000 euros" → 30000,
 * "0" → 0, "80 000 € (déplacement…)" → 80000, "?" ou "" → null.
 * Le texte d'origine est toujours conservé à côté : cette valeur ne sert qu'à l'aide à la décision.
 */
export function parseBudget(raw: string): number | null {
  const value = raw.replace(/\(.*?\)/g, ' ').trim().toLowerCase();
  const match = /(\d[\d\s  ]*(?:[.,]\d+)?)\s*(k|m)?/.exec(value);
  if (!match || match[1] === undefined) return null;
  const amount = Number(match[1].replace(/[\s  ]/g, '').replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  const multiplier = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
  return Math.round(amount * multiplier);
}
