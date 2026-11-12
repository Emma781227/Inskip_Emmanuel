/**
 * Simulation déterministe de la notation IA, à base de règles lisibles.
 * Ce n'est PAS une analyse par un modèle de langage : les mêmes données produisent
 * toujours les mêmes notes, et chaque note est accompagnée de la règle qui l'explique.
 */
import { clampScore } from '../domain/scoring';
import { normalizeText } from '../domain/normalize';
import type { AiSuggestion, CriterionKey, Idea, ScoreCriteria } from '../domain/types';
import type { AiScoringProvider } from './AiScoringProvider';

/** Description jugée trop courte pour être évaluée sereinement (en caractères). */
const SHORT_DESCRIPTION = 90;

/**
 * Hypothèse : priorités supposées d'Hexavia (groupe industriel) en l'absence de
 * document stratégique. À remplacer par la stratégie réelle du client.
 */
const THEME_ALIGNMENT: Record<string, number> = {
  process: 4,
  securite: 4,
  energie: 4,
  environnement: 4,
  client: 4,
  digital: 3,
  'rh bien etre': 3,
};

const IMPACT_KEYWORDS = [
  'production', 'panne', 'arret', 'cout', 'accident', 'client', 'revenu', 'stock', 'rupture',
  'facture', 'temps', 'gain', 'economie', 'baisse', 'absenteisme', 'poste',
];
const INNOVATION_KEYWORDS = [
  'capteur', 'connecte', 'ia', 'intelligence', 'modele', 'predict', 'realite augmentee', 'camera',
  'digital twin', 'jumeau', 'exosquelette', 'ceramique', 'automatiquement', 'temps reel', 'qr',
];
const COMMON_PRACTICE_KEYWORDS = ['cafe', 'parrain', 'wifi', 'enquete', 'sms', 'tri ', 'papier'];

function countMatches(text: string, keywords: string[]): number {
  return keywords.filter((keyword) => new RegExp(`\\b${keyword}`).test(text)).length;
}

function isQuantified(text: string | null): boolean {
  return text !== null && /\d/.test(text);
}

const euros = (amount: number) => `${amount.toLocaleString('fr-FR')} €`;

export function simulateSuggestion(idea: Idea, now: Date = new Date()): AiSuggestion {
  const text = normalizeText(`${idea.title} ${idea.description} ${idea.expectedBenefits ?? ''}`);
  const warnings: string[] = [];
  if (idea.description.length < SHORT_DESCRIPTION) warnings.push('Description très courte : peu d’éléments pour juger.');
  if (!idea.expectedBenefits) warnings.push('Bénéfices attendus non renseignés.');
  else if (idea.expectedBenefits.length < 20) warnings.push('Bénéfices attendus trop vagues.');
  if (idea.budgetEstimateEur === null) warnings.push('Budget absent ou non chiffré.');
  if (!idea.theme) warnings.push('Thème non renseigné.');
  if (/\b(the|and|of|with)\b/.test(text)) warnings.push('Idée rédigée en anglais : vérifier la compréhension.');

  // Impact : gains chiffrés et effets sur la production, les coûts, la sécurité ou les clients.
  const impactHits = countMatches(text, IMPACT_KEYWORDS);
  let impact = 2 + Math.min(2, impactHits);
  const impactReasons: string[] = [`${impactHits} indicateur(s) d'impact repéré(s) dans le texte`];
  if (isQuantified(idea.expectedBenefits) || isQuantified(idea.description)) {
    impact += 1;
    impactReasons.push('gains ou constat chiffrés');
  }
  if (!idea.expectedBenefits || idea.expectedBenefits.length < 20) {
    impact -= 1;
    impactReasons.push('bénéfices absents ou trop vagues');
  }

  // Faisabilité : principalement le budget annoncé.
  let feasibility: number;
  let feasibilityReason: string;
  const budget = idea.budgetEstimateEur;
  if (budget === null) {
    feasibility = 3;
    feasibilityReason = idea.budgetRaw
      ? `Budget « ${idea.budgetRaw} » non chiffrable : note neutre par défaut.`
      : 'Budget non renseigné : note neutre par défaut.';
  } else {
    feasibility = budget <= 10_000 ? 5 : budget <= 50_000 ? 4 : budget <= 150_000 ? 3 : budget <= 300_000 ? 2 : 1;
    feasibilityReason = `Budget estimé à ${euros(budget)} par l'auteur.`;
  }
  if (/\b(modele|digital twin|jumeau|realite augmentee|camera)\b/.test(text)) {
    feasibility -= 1;
    feasibilityReason += ' Complexité technique élevée (données, intégration).';
  }

  // Alignement : thème rattaché à un axe prioritaire supposé.
  const themeKey = idea.theme ? normalizeText(idea.theme) : '';
  let alignment = THEME_ALIGNMENT[themeKey] ?? 2;
  let alignmentReason = idea.theme
    ? `Thème « ${idea.theme} » ${alignment >= 4 ? 'relié à un axe prioritaire supposé' : 'jugé secondaire par hypothèse'} (productivité, sécurité, énergie, client).`
    : 'Thème non renseigné : alignement difficile à établir.';
  if (isQuantified(idea.expectedBenefits)) {
    alignment += 1;
    alignmentReason += ' Bénéfice mesurable, facile à suivre par le groupe.';
  }

  // Caractère innovant : technologies ou approches nouvelles vs pratiques courantes.
  const innovationHits = countMatches(text, INNOVATION_KEYWORDS);
  const commonHits = countMatches(text, COMMON_PRACTICE_KEYWORDS);
  const innovation = 2 + Math.min(3, innovationHits) - Math.min(1, commonHits);
  const innovationReason =
    innovationHits > 0
      ? `${innovationHits} marqueur(s) de nouveauté technologique ou d'usage.`
      : 'Pas de rupture technologique identifiée dans la description.';

  const scores: ScoreCriteria = {
    impact: clampScore(impact),
    feasibility: clampScore(feasibility),
    alignment: clampScore(alignment),
    innovation: clampScore(innovation),
  };
  const justifications: Record<CriterionKey, string> = {
    impact: `${capitalize(impactReasons.join(', '))}.`,
    feasibility: feasibilityReason,
    alignment: alignmentReason,
    innovation: commonHits > 0 ? `${innovationReason} Pratique déjà répandue ailleurs.` : innovationReason,
  };

  const strong = (Object.keys(scores) as CriterionKey[]).filter((key) => scores[key] >= 4);
  const summary =
    warnings.length >= 2
      ? 'Informations insuffisantes : notes indicatives, à confirmer avec le porteur.'
      : strong.length >= 3
        ? 'Idée solide sur la plupart des critères.'
        : strong.length === 0
          ? 'Idée à approfondir : aucun critère ne ressort nettement.'
          : 'Idée intéressante sur certains critères, à arbitrer.';

  return {
    ideaId: idea.id,
    scores,
    justifications,
    summary,
    warnings,
    provider: 'mock-rules-v1',
    simulated: true,
    generatedAt: now.toISOString(),
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class MockAiScoringProvider implements AiScoringProvider {
  readonly id = 'mock-rules-v1';
  readonly label = 'Simulation (règles déterministes)';
  readonly simulated = true;

  constructor(private readonly latencyMs = 0) {}

  async suggest(idea: Idea): Promise<AiSuggestion> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    return simulateSuggestion(idea);
  }
}
