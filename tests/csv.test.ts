import { describe, expect, it } from 'vitest';
import { CsvImportError, parseIdeasCsv } from '../src/data/csv';
import { HEXAVIA_CSV } from './fixtures';

describe('import du CSV Hexavia', () => {
  const { ideas, warnings } = parseIdeasCsv(HEXAVIA_CSV);
  const byId = new Map(ideas.map((idea) => [idea.id, idea]));

  it('importe les 40 idées sans avertissement', () => {
    expect(ideas).toHaveLength(40);
    expect(warnings).toEqual([]);
  });

  it('conserve les identifiants IDEA-001 à IDEA-040 dans l’ordre', () => {
    expect(ideas.map((idea) => idea.id)).toEqual(Array.from({ length: 40 }, (_, i) => `IDEA-${String(i + 1).padStart(3, '0')}`));
  });

  it('lit le séparateur « ; » et le BOM (premier en-tête bien reconnu)', () => {
    const first = byId.get('IDEA-001')!;
    expect(first.title).toBe('Capteurs de vibration sur les compresseurs');
    expect(first.author).toEqual({ firstName: 'Julie', lastName: 'Marchand' });
    expect(first.budgetRaw).toBe('40 000 €');
  });

  it('représente les champs vides par null sans perdre la ligne', () => {
    expect(byId.get('IDEA-015')!.theme).toBeNull();
    expect(byId.get('IDEA-029')!.theme).toBeNull();
    expect(byId.get('IDEA-040')!.site).toBeNull();
    expect(byId.get('IDEA-019')!.expectedBenefits).toBeNull();
    expect(byId.get('IDEA-007')!.budgetRaw).toBe('');
    expect(byId.get('IDEA-007')!.budgetEstimateEur).toBeNull();
  });

  it('normalise la date au format français et garde la saisie d’origine', () => {
    const idea = byId.get('IDEA-033')!;
    expect(idea.submittedAtRaw).toBe('03/10/2026');
    expect(idea.submittedAt).toBe('2026-10-03');
  });

  it('conserve le budget brut à côté de l’estimation numérique', () => {
    expect(byId.get('IDEA-002')).toMatchObject({ budgetRaw: '15k€', budgetEstimateEur: 15000 });
    expect(byId.get('IDEA-010')).toMatchObject({ budgetRaw: '?', budgetEstimateEur: null });
  });

  it('conserve intégralement la description longue', () => {
    expect(byId.get('IDEA-023')!.description.length).toBeGreaterThan(800);
  });
});

describe('robustesse de l’import', () => {
  const header = 'id;date_depot;prenom;nom;direction;site;theme;titre;description;benefices_attendus;budget_estime';

  it('refuse un fichier avec des colonnes manquantes, avec un message clair', () => {
    expect(() => parseIdeasCsv('id,titre\nIDEA-1,Test')).toThrow(CsvImportError);
    expect(() => parseIdeasCsv('id;titre\nIDEA-1;Test')).toThrow(/Colonnes manquantes/);
  });

  it('ignore les lignes sans titre et les identifiants en double, en le signalant', () => {
    const csv = [
      header,
      'A-1;2026-01-01;A;B;D;S;T;Titre;Desc;Ben;1k',
      'A-2;2026-01-01;A;B;D;S;T;;Desc;;',
      'A-1;2026-01-02;A;B;D;S;T;Autre;Desc;;',
    ].join('\n');
    const { ideas, warnings } = parseIdeasCsv(csv);
    expect(ideas.map((idea) => idea.id)).toEqual(['A-1']);
    expect(warnings).toHaveLength(2);
  });

  it('gère les champs entre guillemets contenant des points-virgules', () => {
    const csv = `${header}\nA-1;2026-01-01;A;B;D;S;T;"Titre; avec point-virgule";Desc;;`;
    expect(parseIdeasCsv(csv).ideas[0]!.title).toBe('Titre; avec point-virgule');
  });

  it('refuse un fichier sans aucune idée', () => {
    expect(() => parseIdeasCsv(header)).toThrow(/aucune idée/);
  });
});
