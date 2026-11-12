/**
 * Types de la base Supabase, écrits à la main pour refléter
 * supabase/migrations/20261112170000_init_ideapilot.sql.
 * (Régénérables avec `npx supabase gen types typescript --linked`.)
 * Des `type` et non des `interface` : supabase-js exige des Record<string, unknown>.
 */

export type IdeaRow = {
  id: string;
  submitted_at: string | null;
  submitted_at_raw: string;
  author_first_name: string;
  author_last_name: string;
  direction: string | null;
  site: string | null;
  theme: string | null;
  title: string;
  description: string;
  expected_benefits: string | null;
  budget_raw: string;
  budget_estimate_eur: number | null;
  created_at: string;
  updated_at: string;
};
export type IdeaInsert = Omit<IdeaRow, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string };

type ScoreColumns = {
  impact: number;
  feasibility: number;
  alignment: number;
  innovation: number;
};

export type AiSuggestionRow = ScoreColumns & {
  idea_id: string;
  justifications: Record<string, string>;
  summary: string;
  warnings: string[];
  provider: string;
  simulated: boolean;
  generated_at: string;
};
export type AiSuggestionInsert = AiSuggestionRow;

export type EvaluationRow = ScoreColumns & {
  idea_id: string;
  comment: string;
  evaluated_by: string | null;
  created_at: string;
  updated_at: string;
};
export type EvaluationInsert = ScoreColumns & { idea_id: string; comment: string };

export type ShortlistRow = {
  idea_id: string;
  selected_by: string | null;
  selected_at: string;
};
export type ShortlistInsert = { idea_id: string };

export type TeamMemberRow = { user_id: string; created_at: string };

type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      ideas: Table<IdeaRow, IdeaInsert>;
      ai_suggestions: Table<AiSuggestionRow, AiSuggestionInsert>;
      evaluations: Table<EvaluationRow, EvaluationInsert>;
      shortlist: Table<ShortlistRow, ShortlistInsert>;
      team_members: Table<TeamMemberRow, { user_id: string }>;
    };
    Views: Record<never, never>;
    Functions: {
      is_team_member: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
