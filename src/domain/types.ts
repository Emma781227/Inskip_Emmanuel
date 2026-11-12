/**
 * Modèle de données IdeaPilot.
 * Les idées viennent du CSV (lecture seule) ; tout ce qui est produit dans l'outil
 * (suggestions IA, évaluations de Camille, shortlist) est stocké à part, indexé par id d'idée.
 */

export const CRITERIA = ['impact', 'feasibility', 'alignment', 'innovation'] as const;
export type CriterionKey = (typeof CRITERIA)[number];

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  impact: "Impact pour l'entreprise",
  feasibility: 'Faisabilité',
  alignment: 'Alignement stratégique',
  innovation: 'Caractère innovant',
};

export const CRITERION_HELP: Record<CriterionKey, string> = {
  impact: 'Gains attendus : coûts, production, sécurité, clients.',
  feasibility: 'Budget, complexité technique, délai de mise en œuvre.',
  alignment: 'Cohérence avec les priorités du groupe.',
  innovation: 'Nouveauté par rapport aux pratiques actuelles.',
};

/** Note entière de 1 à 5. */
export type Score = 1 | 2 | 3 | 4 | 5;

/** Une note par critère de la grille du client. */
export type ScoreCriteria = Record<CriterionKey, Score>;

export interface Author {
  firstName: string;
  lastName: string;
}

export interface Idea {
  /** Identifiant d'origine, conservé tel quel (IDEA-001…). */
  id: string;
  /** Date de dépôt normalisée en ISO (AAAA-MM-JJ), ou null si illisible. */
  submittedAt: string | null;
  /** Date telle qu'écrite dans le fichier. */
  submittedAtRaw: string;
  author: Author;
  direction: string | null;
  site: string | null;
  theme: string | null;
  title: string;
  description: string;
  expectedBenefits: string | null;
  /** Budget tel que saisi par l'auteur — jamais modifié. */
  budgetRaw: string;
  /** Estimation numérique en euros extraite du texte libre, null si non interprétable. */
  budgetEstimateEur: number | null;
}

export interface AiSuggestion {
  ideaId: string;
  scores: ScoreCriteria;
  justifications: Record<CriterionKey, string>;
  /** Synthèse lisible en une ou deux phrases. */
  summary: string;
  /** Informations manquantes ou insuffisantes repérées. */
  warnings: string[];
  /** Identifiant du fournisseur (ex. "mock-rules-v1"). */
  provider: string;
  /** true si les notes viennent d'une simulation et non d'un modèle. */
  simulated: boolean;
  generatedAt: string;
}

export interface HumanEvaluation {
  ideaId: string;
  /** Notes validées par Camille : seules elles comptent pour le score final. */
  scores: ScoreCriteria;
  /** Justification / commentaire de Camille. */
  comment: string;
  updatedAt: string;
}

export type DuplicateReason = 'identical-title' | 'lexical-similarity';

export interface DuplicateCandidate {
  ideaId: string;
  otherIdeaId: string;
  /** Similarité de 0 à 1. */
  similarity: number;
  reason: DuplicateReason;
}

export interface ShortlistSelection {
  ideaId: string;
  selectedAt: string;
}

export type EvaluationStatus = 'todo' | 'ai-proposed' | 'evaluated';

/** Tout ce que l'outil persiste pour un jeu d'idées donné. */
export interface WorkspaceState {
  aiSuggestions: Record<string, AiSuggestion>;
  evaluations: Record<string, HumanEvaluation>;
  shortlist: Record<string, ShortlistSelection>;
}

export const emptyWorkspace = (): WorkspaceState => ({
  aiSuggestions: {},
  evaluations: {},
  shortlist: {},
});
