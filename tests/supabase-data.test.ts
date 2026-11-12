import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { simulateSuggestion } from '../src/ai/MockAiScoringProvider';
import { parseIdeasCsv } from '../src/data/csv';
import type { EvaluationRow } from '../src/data/database.types';
import {
  InvalidRowError,
  evaluationToRow,
  ideaToRow,
  prepareIdeaImport,
  rowToEvaluation,
  rowToIdea,
  rowToSuggestion,
  suggestionToRow,
} from '../src/data/mappers';
import { readSupabaseConfig } from '../src/data/supabaseConfig';
import { HEXAVIA_CSV, makeIdea } from './fixtures';

const { ideas } = parseIdeasCsv(HEXAVIA_CSV);
const timestamps = { created_at: '2026-11-12T10:00:00Z', updated_at: '2026-11-12T10:00:00Z' };

describe('correspondance base ↔ modèle métier', () => {
  it('conserve chaque idée à l’identique (aller-retour) pour les 40 idées', () => {
    for (const idea of ideas) expect(rowToIdea({ ...ideaToRow(idea), ...timestamps })).toEqual(idea);
  });

  it('garde l’identifiant métier du CSV comme clé', () => {
    expect(ideaToRow(ideas[0]!).id).toBe('IDEA-001');
  });

  it('prépare un import idempotent : une ligne par identifiant, même si le fichier est importé deux fois', () => {
    const rows = prepareIdeaImport([...ideas, ...ideas]);
    expect(rows).toHaveLength(40);
    expect(new Set(rows.map((row) => row.id)).size).toBe(40);
    expect(prepareIdeaImport(ideas)).toEqual(prepareIdeaImport(ideas));
  });

  it('en cas d’identifiant répété, la dernière version l’emporte', () => {
    const rows = prepareIdeaImport([makeIdea({ title: 'Ancien' }), makeIdea({ title: 'Corrigé' })]);
    expect(rows.map((row) => row.title)).toEqual(['Corrigé']);
  });

  it('l’import ne contient que des idées, jamais d’évaluation ou de proposition IA', () => {
    const keys = Object.keys(prepareIdeaImport(ideas)[0]!);
    expect(keys).not.toContain('impact');
    expect(keys).not.toContain('comment');
  });

  it('stocke et relit une proposition IA sans perte', () => {
    const suggestion = simulateSuggestion(ideas[0]!, new Date('2026-11-12T10:00:00Z'));
    expect(rowToSuggestion(suggestionToRow(suggestion))).toEqual(suggestion);
  });

  it('relit une évaluation humaine avec sa date de modification', () => {
    const row: EvaluationRow = { ...evaluationToRow('IDEA-001', { impact: 4, feasibility: 3, alignment: 5, innovation: 2 }, '  RAS  '), evaluated_by: null, ...timestamps };
    expect(rowToEvaluation(row)).toEqual({
      ideaId: 'IDEA-001',
      scores: { impact: 4, feasibility: 3, alignment: 5, innovation: 2 },
      comment: 'RAS',
      updatedAt: timestamps.updated_at,
    });
  });

  it('refuse une note hors 1–5 venant de la base', () => {
    const row: EvaluationRow = { idea_id: 'IDEA-001', impact: 9, feasibility: 3, alignment: 3, innovation: 3, comment: '', evaluated_by: null, ...timestamps };
    expect(() => rowToEvaluation(row)).toThrow(InvalidRowError);
  });
});

describe('configuration Supabase', () => {
  const url = 'https://abcd.supabase.co';
  const fakeJwt = (role: string) => `xx.${btoa(JSON.stringify({ role }))}.yy`;

  it('accepte la clé publishable', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toEqual({
      ok: true,
      config: { url, publishableKey: 'sb_publishable_abc', keySource: 'VITE_SUPABASE_PUBLISHABLE_KEY' },
    });
  });

  it('accepte une ancienne clé anon par compatibilité, la publishable restant prioritaire', () => {
    const anon = fakeJwt('anon');
    const fallback = readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon });
    expect(fallback.ok && fallback.config.keySource).toBe('VITE_SUPABASE_ANON_KEY');
    const both = readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc', VITE_SUPABASE_ANON_KEY: anon });
    expect(both.ok && both.config.publishableKey).toBe('sb_publishable_abc');
  });

  it('refuse de démarrer avec une clé secrète ou service_role', () => {
    for (const key of ['sb_secret_abc', fakeJwt('service_role')]) {
      const result = readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.problems.join(' ')).toMatch(/SECRÈTE/);
    }
  });

  it('signale les variables manquantes', () => {
    const result = readSupabaseConfig({});
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems).toHaveLength(2);
  });
});

describe('migration SQL (contrôle statique)', () => {
  const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  const sql = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(dir + file, 'utf8'))
    .join('\n')
    .toLowerCase();
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((match) => match[1]!);

  it('définit les tables attendues', () => {
    expect(tables).toEqual(expect.arrayContaining(['ideas', 'ai_suggestions', 'evaluations', 'shortlist', 'team_members']));
  });

  it('active la RLS sur chaque table', () => {
    for (const table of tables) expect(sql).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`));
  });

  it('n’accorde rien au rôle anon et borne les notes de 1 à 5', () => {
    expect(sql).not.toMatch(/to anon/);
    expect(sql.match(/check \((impact|feasibility|alignment|innovation) between 1 and 5\)/g)).toHaveLength(8);
  });

  it('ne permet pas de supprimer une idée depuis l’application', () => {
    expect(sql).not.toMatch(/on public\.ideas for delete/);
  });
});
