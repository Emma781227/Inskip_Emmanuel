import { describe, expect, it, vi } from 'vitest';
import { AiProviderError, HttpAiScoringProvider } from '../src/ai/HttpAiScoringProvider';
import { resolveAiProviderName } from '../src/ai/config';
import {
  InvalidModelOutputError,
  SCORING_INPUT_LIMITS,
  buildScoringUserMessage,
  modelScoringToSuggestion,
  parseAiSuggestionPayload,
  toScoringInput,
  validateScoringInput,
  type ModelScoring,
} from '../src/ai/scoringPrompt';
import { ModelScoringSchema } from '../server/anthropicScorer';
import { handleScoreRequest, type ScoreHandlerDeps } from '../server/scoreHandler';
import { makeIdea } from './fixtures';

const now = new Date('2026-11-12T10:00:00Z');
const idea = makeIdea({ id: 'IDEA-001', author: { firstName: 'Julie', lastName: 'Marchand' } });

const modelOutput: ModelScoring = {
  criteria: {
    impact: { score: 4, justification: ' Moins d’arrêts de production. ' },
    feasibility: { score: 3, justification: 'Budget de 20 000 €.' },
    alignment: { score: 4, justification: 'Productivité.' },
    innovation: { score: 2, justification: 'Pratique courante.' },
  },
  summary: 'Idée solide.',
  warnings: ['Stratégie du client supposée.', '  '],
};

describe('préparation des données envoyées au modèle', () => {
  it('n’envoie jamais le nom de l’auteur', () => {
    const input = toScoringInput(idea);
    expect(JSON.stringify(input)).not.toMatch(/Julie|Marchand/);
    expect(buildScoringUserMessage(input)).not.toMatch(/Julie|Marchand/);
  });

  it('signale explicitement les champs vides au modèle', () => {
    const message = buildScoringUserMessage(toScoringInput(makeIdea({ expectedBenefits: null, theme: null })));
    expect(message).toContain('Bénéfices attendus : (non renseigné)');
    expect(message).toContain('Thème : (non renseigné)');
  });

  it('refuse une idée trop longue au lieu de la tronquer', () => {
    const tooLong = { ...toScoringInput(idea), description: 'x'.repeat(SCORING_INPUT_LIMITS.description + 1) };
    expect(validateScoringInput(tooLong).ok).toBe(false);
    expect(validateScoringInput({ title: 'sans id' }).ok).toBe(false);
    expect(validateScoringInput(toScoringInput(idea))).toEqual({ ok: true, input: toScoringInput(idea) });
  });
});

describe('sortie du modèle', () => {
  it('devient une suggestion non simulée, nettoyée', () => {
    const suggestion = modelScoringToSuggestion('IDEA-001', modelOutput, 'anthropic:claude-opus-5-5', now);
    expect(suggestion).toMatchObject({
      ideaId: 'IDEA-001',
      scores: { impact: 4, feasibility: 3, alignment: 4, innovation: 2 },
      simulated: false,
      provider: 'anthropic:claude-opus-5-5',
      warnings: ['Stratégie du client supposée.'],
    });
    expect(suggestion.justifications.impact).toBe('Moins d’arrêts de production.');
  });

  it('refuse une note hors 1–5 au lieu de la corriger', () => {
    const bad = { ...modelOutput, criteria: { ...modelOutput.criteria, impact: { score: 7, justification: '' } } };
    expect(() => modelScoringToSuggestion('IDEA-001', bad, 'x', now)).toThrow(InvalidModelOutputError);
  });

  it('le schéma imposé au modèle borne les notes et exige les 4 critères', () => {
    expect(ModelScoringSchema.safeParse(modelOutput).success).toBe(true);
    expect(ModelScoringSchema.safeParse({ ...modelOutput, criteria: { ...modelOutput.criteria, innovation: { score: 6, justification: '' } } }).success).toBe(false);
    expect(ModelScoringSchema.safeParse({ ...modelOutput, criteria: { impact: modelOutput.criteria.impact } }).success).toBe(false);
  });

  it('le navigateur revalide la réponse du serveur', () => {
    const suggestion = modelScoringToSuggestion('IDEA-001', modelOutput, 'p', now);
    expect(parseAiSuggestionPayload(JSON.parse(JSON.stringify(suggestion)), 'IDEA-001')).toEqual(suggestion);
    expect(parseAiSuggestionPayload(suggestion, 'IDEA-002')).toBeNull();
    expect(parseAiSuggestionPayload({ ...suggestion, scores: { ...suggestion.scores, impact: 0 } }, 'IDEA-001')).toBeNull();
  });
});

describe('fonction serveur /api/score (dépendances simulées)', () => {
  const deps = (overrides: Partial<ScoreHandlerDeps> = {}): ScoreHandlerDeps => ({
    isConfigured: true,
    isTeamMember: async (token) => token === 'jeton-membre',
    scoreIdea: async () => modelOutput,
    providerId: 'anthropic:claude-opus-5-5',
    now: () => now,
    ...overrides,
  });
  const request = (token: string | null, body: unknown = toScoringInput(idea)) =>
    new Request('https://app.test/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

  it('répond 503 « not_configured » tant que la clé n’est pas définie, sans appeler le modèle', async () => {
    const scoreIdea = vi.fn();
    const response = await handleScoreRequest(request('jeton-membre'), deps({ isConfigured: false, scoreIdea }));
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe('not_configured');
    expect(scoreIdea).not.toHaveBeenCalled();
  });

  it('exige une session (401) et l’appartenance à l’équipe (403)', async () => {
    expect((await handleScoreRequest(request(null), deps())).status).toBe(401);
    expect((await handleScoreRequest(request('jeton-inconnu'), deps())).status).toBe(403);
    const failing = deps({ isTeamMember: async () => Promise.reject(new Error('réseau')) });
    expect((await handleScoreRequest(request('jeton-membre'), failing)).status).toBe(403);
  });

  it('refuse les méthodes autres que POST et les corps invalides', async () => {
    expect((await handleScoreRequest(new Request('https://app.test/api/score'), deps())).status).toBe(405);
    expect((await handleScoreRequest(request('jeton-membre', { foo: 1 }), deps())).status).toBe(400);
  });

  it('renvoie la suggestion du modèle pour un membre connecté', async () => {
    const response = await handleScoreRequest(request('jeton-membre'), deps());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { suggestion: unknown };
    expect(parseAiSuggestionPayload(body.suggestion, 'IDEA-001')).toMatchObject({ simulated: false, scores: { impact: 4 } });
  });

  it('transforme une erreur du modèle en 502 lisible, sans divulguer le détail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handleScoreRequest(request('jeton-membre'), deps({ scoreIdea: async () => Promise.reject(new Error('secret interne')) }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret interne');
  });
});

describe('HttpAiScoringProvider (navigateur)', () => {
  const okFetch = (suggestion: unknown) =>
    vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ suggestion }), { status: 200 }));

  it('envoie le jeton de session et l’idée sans auteur, puis valide la réponse', async () => {
    const expected = modelScoringToSuggestion('IDEA-001', modelOutput, 'p', now);
    const fetchImpl = okFetch(expected);
    const provider = new HttpAiScoringProvider({ getAccessToken: async () => 'jeton', fetchImpl });
    await expect(provider.suggest(idea)).resolves.toEqual(expected);
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jeton');
    expect(String(init.body)).not.toMatch(/Marchand/);
  });

  it('traduit les erreurs serveur en messages pour la consultante', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'not_configured', message: '' } }), { status: 503 }));
    const provider = new HttpAiScoringProvider({ getAccessToken: async () => 'jeton', fetchImpl });
    await expect(provider.suggest(idea)).rejects.toThrow(/pas encore activée/);
    await expect(provider.suggest(idea)).rejects.toBeInstanceOf(AiProviderError);
  });

  it('n’appelle pas le serveur sans session', async () => {
    const fetchImpl = vi.fn();
    const provider = new HttpAiScoringProvider({ getAccessToken: async () => null, fetchImpl });
    await expect(provider.suggest(idea)).rejects.toThrow(/session/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejette une réponse serveur mal formée', async () => {
    const provider = new HttpAiScoringProvider({ getAccessToken: async () => 'jeton', fetchImpl: okFetch({ ideaId: 'IDEA-001' }) });
    await expect(provider.suggest(idea)).rejects.toThrow(/invalide/);
  });
});

describe('choix du fournisseur', () => {
  it('reste sur la simulation par défaut', () => {
    expect(resolveAiProviderName(undefined)).toBe('mock');
    expect(resolveAiProviderName('mock')).toBe('mock');
    expect(resolveAiProviderName(' HTTP ')).toBe('http');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveAiProviderName('openai')).toBe('mock');
  });
});
