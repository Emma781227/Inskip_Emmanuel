-- IdeaPilot — schéma initial
-- À appliquer une fois (SQL Editor de Supabase, ou `supabase db push`).
--
-- Principes :
--  * `ideas` reprend l'export du formulaire ; l'identifiant métier du CSV (IDEA-001…) est la clé primaire.
--  * Les propositions de l'IA (`ai_suggestions`) et les notes de la consultante (`evaluations`)
--    sont dans deux tables distinctes : relancer l'IA ne peut pas écraser une note humaine.
--  * Aucune donnée n'est lisible sans être connecté ET inscrit dans `team_members`
--    (les noms des auteurs ne sont donc jamais publics, même si les inscriptions restaient ouvertes).
--  * Le rôle `anon` n'a aucun droit. Aucune clé `service_role` n'est nécessaire côté application.

-- ---------------------------------------------------------------------------
-- Équipe autorisée
-- ---------------------------------------------------------------------------
create table public.team_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.team_members is
  'Comptes autorisés à utiliser IdeaPilot. Ajout manuel : insert into team_members (user_id) select id from auth.users where email = ''…'';';

-- security definer : lit team_members sans dépendre de ses propres politiques RLS.
create function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members where user_id = (select auth.uid()));
$$;

revoke all on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

-- Mise à jour automatique de updated_at
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Idées (import du CSV, idempotent par upsert sur id)
-- ---------------------------------------------------------------------------
create table public.ideas (
  id                  text primary key check (length(trim(id)) > 0),
  submitted_at        date,
  submitted_at_raw    text not null default '',
  author_first_name   text not null default '',
  author_last_name    text not null default '',
  direction           text,
  site                text,
  theme               text,
  title               text not null check (length(trim(title)) > 0),
  description         text not null default '',
  expected_benefits   text,
  budget_raw          text not null default '',
  budget_estimate_eur integer check (budget_estimate_eur is null or budget_estimate_eur >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index ideas_direction_idx    on public.ideas (direction);
create index ideas_theme_idx        on public.ideas (theme);
create index ideas_site_idx         on public.ideas (site);
create index ideas_submitted_at_idx on public.ideas (submitted_at);

create trigger ideas_set_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Propositions de l'IA (simulation en V1) — une par idée, remplacée à chaque relance
-- ---------------------------------------------------------------------------
create table public.ai_suggestions (
  idea_id        text primary key references public.ideas (id) on delete cascade,
  impact         smallint not null check (impact between 1 and 5),
  feasibility    smallint not null check (feasibility between 1 and 5),
  alignment      smallint not null check (alignment between 1 and 5),
  innovation     smallint not null check (innovation between 1 and 5),
  justifications jsonb not null check (jsonb_typeof(justifications) = 'object'),
  summary        text not null default '',
  warnings       text[] not null default '{}',
  provider       text not null,
  simulated      boolean not null default true,
  generated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Évaluations validées par la consultante — seules à compter dans le score final
-- ---------------------------------------------------------------------------
create table public.evaluations (
  idea_id      text primary key references public.ideas (id) on delete cascade,
  impact       smallint not null check (impact between 1 and 5),
  feasibility  smallint not null check (feasibility between 1 and 5),
  alignment    smallint not null check (alignment between 1 and 5),
  innovation   smallint not null check (innovation between 1 and 5),
  comment      text not null default '' check (length(comment) <= 2000),
  evaluated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index evaluations_evaluated_by_idx on public.evaluations (evaluated_by);

create trigger evaluations_set_updated_at
  before update on public.evaluations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Shortlist pour le jury
-- ---------------------------------------------------------------------------
create table public.shortlist (
  idea_id     text primary key references public.ideas (id) on delete cascade,
  selected_by uuid references auth.users (id) on delete set null default auth.uid(),
  selected_at timestamptz not null default now()
);

create index shortlist_selected_by_idx on public.shortlist (selected_by);

-- ---------------------------------------------------------------------------
-- Sécurité : RLS partout, rien pour anon, tout pour les membres de l'équipe
-- ---------------------------------------------------------------------------
alter table public.team_members   enable row level security;
alter table public.ideas          enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.evaluations    enable row level security;
alter table public.shortlist      enable row level security;

revoke all on public.team_members, public.ideas, public.ai_suggestions, public.evaluations, public.shortlist from anon;

-- Chacun peut seulement vérifier sa propre inscription ; l'ajout de membres se fait côté administration.
create policy "team_members: lecture de sa propre ligne"
  on public.team_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "ideas: lecture équipe"       on public.ideas for select to authenticated using (public.is_team_member());
create policy "ideas: import équipe"        on public.ideas for insert to authenticated with check (public.is_team_member());
create policy "ideas: mise à jour équipe"   on public.ideas for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
-- Pas de politique delete sur ideas : aucune idée ne peut être supprimée depuis l'application.

create policy "ai_suggestions: lecture équipe"     on public.ai_suggestions for select to authenticated using (public.is_team_member());
create policy "ai_suggestions: écriture équipe"    on public.ai_suggestions for insert to authenticated with check (public.is_team_member());
create policy "ai_suggestions: remplacement équipe" on public.ai_suggestions for update to authenticated using (public.is_team_member()) with check (public.is_team_member());

create policy "evaluations: lecture équipe"     on public.evaluations for select to authenticated using (public.is_team_member());
create policy "evaluations: création équipe"    on public.evaluations for insert to authenticated with check (public.is_team_member());
create policy "evaluations: modification équipe" on public.evaluations for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "evaluations: suppression équipe" on public.evaluations for delete to authenticated using (public.is_team_member());

create policy "shortlist: lecture équipe"     on public.shortlist for select to authenticated using (public.is_team_member());
create policy "shortlist: ajout équipe"       on public.shortlist for insert to authenticated with check (public.is_team_member());
create policy "shortlist: retrait équipe"     on public.shortlist for delete to authenticated using (public.is_team_member());
