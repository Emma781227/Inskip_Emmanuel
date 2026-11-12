/**
 * Détection lexicale de doublons potentiels.
 *
 * Méthode : normalisation (casse, accents, ponctuation) → tokenisation → suppression
 * des mots vides → synonymes courants → racine naïve (6 lettres) → similarité de Jaccard
 * sur les ensembles de mots. Deux mesures sont calculées :
 *  - sur le texte complet (titre + description), signal principal ;
 *  - sur le titre seul, plus bruité (titres courts) d'où un seuil plus élevé.
 * Un titre identique après normalisation est toujours signalé (similarité 1).
 *
 * Rien n'est jamais fusionné ni supprimé : on se contente de signaler.
 * Limite connue : une reformulation sans vocabulaire commun n'est pas détectée.
 */
import { normalizeText } from './normalize';
import type { DuplicateCandidate, Idea } from './types';

export interface DuplicateThresholds {
  /** Seuil sur le texte complet (titre + description). */
  text: number;
  /** Seuil sur le titre seul. */
  title: number;
}

/**
 * Seuils réglés sur l'export Hexavia (voir README) : le bruit plafonne à 0,15 sur le
 * texte complet et à 0,20 sur les titres ; les vrais doublons sont au-dessus.
 * Baisser `text` signale plus de paires (plus de faux positifs), le monter en signale moins.
 */
export const DUPLICATE_THRESHOLDS: DuplicateThresholds = { text: 0.16, title: 0.5 };

const STOP_WORDS = new Set(
  (
    'a au aux avec ce ces cette dans de des du elle en et est etre il ils je la le les leur leurs ' +
    'ma mais me meme mes mon ne nos notre nous on ou par pas plus pour qu que qui sa se ses son ' +
    'sur ta te tes ton tous tout toute toutes un une vos votre vous y d l s c n j qu sans entre ' +
    'chaque aujourd hui afin ainsi alors avant apres comme donc deja tres peu fait faire mettre ' +
    'place cas lors sont ont avoir sera seront pourrait peut nos plutot autre autres the of and to for ' +
    'in on with a an ' +
    // Mots génériques du contexte d'un challenge interne : présents partout, peu discriminants.
    'salarie salaries site sites entreprise equipe equipes jour jours an ans travail moin mieux nouveau nouvelle ' +
    'automatiquement automatique permettre pouvoir utiliser creer proposer'
  ).split(/\s+/),
);

/** Synonymes ramenés à un terme commun (liste courte, à enrichir au fil des challenges). */
const SYNONYMS: Record<string, string> = {
  chatbot: 'assistant',
  robot: 'assistant',
  conversationnel: 'assistant',
  dicter: 'dictee',
  dictent: 'dictee',
  vocale: 'dictee',
  compte: 'rapport',
  rendu: 'rapport',
  prevoir: 'predictive',
  prevision: 'predictive',
};

/** Racine naïve : on tronque les mots longs à 6 lettres (rapports/rapport, prédictive/prédire…). */
const STEM_LENGTH = 6;

/** Mots significatifs d'un texte, ramenés à leur racine naïve. */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of normalizeText(text).split(' ')) {
    if (word.length < 2 || STOP_WORDS.has(word) || /^\d+$/.test(word)) continue;
    const singular = word.length > 3 ? word.replace(/(s|x)$/, '') : word;
    const canonical = SYNONYMS[word] ?? SYNONYMS[singular] ?? singular;
    tokens.add(canonical.slice(0, STEM_LENGTH));
  }
  return tokens;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

/** Paires de doublons potentiels, chacune une seule fois, triées par similarité décroissante. */
export function findDuplicatePairs(
  ideas: Idea[],
  thresholds: DuplicateThresholds = DUPLICATE_THRESHOLDS,
): DuplicateCandidate[] {
  const prepared = ideas.map((idea) => ({
    idea,
    normalizedTitle: normalizeText(idea.title),
    titleTokens: tokenize(idea.title),
    fullTokens: tokenize(`${idea.title} ${idea.description}`),
  }));

  const pairs: DuplicateCandidate[] = [];
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const a = prepared[i]!;
      const b = prepared[j]!;
      if (a.normalizedTitle !== '' && a.normalizedTitle === b.normalizedTitle) {
        pairs.push({ ideaId: a.idea.id, otherIdeaId: b.idea.id, similarity: 1, reason: 'identical-title' });
        continue;
      }
      const textSimilarity = jaccard(a.fullTokens, b.fullTokens);
      const titleSimilarity = jaccard(a.titleTokens, b.titleTokens);
      const flagged = textSimilarity >= thresholds.text || titleSimilarity >= thresholds.title;
      if (!flagged) continue;
      pairs.push({
        ideaId: a.idea.id,
        otherIdeaId: b.idea.id,
        similarity: Math.round(Math.max(textSimilarity, titleSimilarity) * 100) / 100,
        reason: 'lexical-similarity',
      });
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

/** Index id → doublons potentiels de cette idée (vus depuis elle), triés par similarité. */
export function indexDuplicates(pairs: DuplicateCandidate[]): Map<string, DuplicateCandidate[]> {
  const index = new Map<string, DuplicateCandidate[]>();
  const push = (candidate: DuplicateCandidate) => {
    const list = index.get(candidate.ideaId) ?? [];
    list.push(candidate);
    index.set(candidate.ideaId, list);
  };
  for (const pair of pairs) {
    push(pair);
    push({ ...pair, ideaId: pair.otherIdeaId, otherIdeaId: pair.ideaId });
  }
  for (const list of index.values()) list.sort((x, y) => y.similarity - x.similarity);
  return index;
}
