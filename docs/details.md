# IdeaPilot — détails techniques

Compléments du [README](../README.md) : installation complète, conception détaillée, tests,
livraison et journal complet.

## Installation complète (nouvelle base Supabase)

Prérequis : Node.js 20 ou plus, un projet Supabase (offre gratuite).

```bash
npm install
cp .env.example .env.local   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                  # http://localhost:5173
```

Première mise en place de la base (une seule fois, environ 3 minutes) :

1. **Schéma.** Dans Supabase > *SQL Editor*, exécuter
   [`supabase/migrations/20261112170000_init_ideapilot.sql`](../supabase/migrations/20261112170000_init_ideapilot.sql)
   (ou `npx supabase link` puis `npx supabase db push`).
2. **Compte.** *Authentication > Users > Add user* (e-mail + mot de passe, « Auto confirm »).
   Désactiver les inscriptions publiques (*Authentication > Sign In / Providers*).
3. **Autoriser ce compte.** Dans le SQL Editor :
   `insert into public.team_members (user_id) select id from auth.users where email = 'demo@exemple.fr';`
4. **Import initial.** Se connecter, cliquer « Importer le fichier des idées » et choisir
   `data/idees_hexavia.csv`. L'import est **idempotent** : le relancer met à jour les 40 idées sans
   en créer de nouvelles et sans toucher aux évaluations.

Sans configuration Supabase, l'application affiche « Configuration requise » au lieu de planter.
Commandes : `npm test`, `npm run typecheck`, `npm run build`.

## Conception détaillée

```
CSV ──▶ data/csv.ts (Papa Parse) ──▶ Idea[]
                                        │
      domain/ (pur, testé) : scoring, duplicates, filters, shortlist, workspace
                                        │
ai/AiScoringProvider ◀── Mock…   data/repository.ts ──▶ Supabase (Postgres + RLS)
                                        │      ▲ mappers.ts (ligne ↔ modèle)
  state/AppStore (session, chargement, écritures) ──▶ AuthGate ──▶ pages/
```

**Modèle métier** (`src/domain/types.ts`). `Idea` reprend le CSV (identifiants conservés, champs
vides = `null`, `budgetRaw` + `budgetEstimateEur`, `submittedAtRaw` + `submittedAt`).
`AiSuggestion` (notes proposées, justification par critère, alertes, fournisseur, date),
`HumanEvaluation` (notes de Camille, commentaire, date de modification) et `ShortlistSelection`
sont séparés. Doublons, statut et score final sont **calculés**, jamais stockés.

**Base Supabase** (migration versionnée dans `supabase/migrations/`) :

| Table | Contenu | Clé |
| --- | --- | --- |
| `ideas` | export du formulaire, budget et date bruts conservés | `id` = identifiant métier du CSV |
| `ai_suggestions` | notes 1–5 proposées, justifications (`jsonb`), alertes, fournisseur | `idea_id` → `ideas` |
| `evaluations` | notes 1–5 validées, commentaire, auteur, `created_at` / `updated_at` | `idea_id` → `ideas` |
| `shortlist` | sélection pour le jury, auteur, date | `idea_id` → `ideas` |
| `team_members` | comptes autorisés | `user_id` → `auth.users` |

Contraintes `CHECK` sur les notes, index sur direction / thème / site / date, `updated_at` par
trigger. L'application parle à l'interface `IdeaPilotRepository` ; `SupabaseRepository`
l'implémente, `mappers.ts` convertit et revalide les lignes. Une écriture n'apparaît comme
enregistrée qu'une fois confirmée par le serveur.

**Sécurité.** RLS sur toutes les tables, aucun droit pour `anon`. Lire ou écrire exige d'être
connecté **et** inscrit dans `team_members` (`is_team_member()`) : une inscription ouverte par
erreur ne suffirait pas à lire les noms. Aucune politique `delete` sur `ideas`. Le navigateur ne
reçoit que l'URL et la clé publique ; l'application refuse de démarrer avec une clé secrète.

**IA.** `AiScoringProvider` isole le fournisseur, choisi par `VITE_AI_PROVIDER` :
- `mock` (défaut) : règles déterministes (budget → faisabilité, thème → alignement, mots-clés →
  impact et innovation), alertes sur les informations manquantes, présentée comme une simulation ;
- `http` (prêt, inactif) : `HttpAiScoringProvider` → fonction Vercel `api/score.ts`, qui vérifie
  session et appartenance à l'équipe, valide l'idée puis appelle Claude (`claude-opus-5-5`, SDK
  officiel, sortie imposée par un schéma Zod, repli automatique si le modèle décline). La clé
  `ANTHROPIC_API_KEY` reste sur le serveur ; sans elle, la route répond 503.
Seul le contenu de l'idée est envoyé au modèle, jamais le nom de son auteur.

**Doublons.** Normalisation (accents, casse, ponctuation), mots vides, synonymes courants
(chatbot → assistant…), racine naïve, similarité de Jaccard sur le texte complet (seuil 0,16) et
sur le titre (seuil 0,5) ; titre identique = 100 %. Seuils réglés sur l'export Hexavia, ajustables
dans `src/domain/duplicates.ts`.

## Erreurs de l'IA, en détail

**Seuil de doublons.** Premier jet : un seul seuil de Jaccard (0,25) choisi a priori. En affichant
toutes les paires avec leur score, il **ratait** « Assistant IA pour les questions RH » / « Chatbot
RH » (0,24) et les deux idées sur les compresseurs (0,20), et **signalait** « Covoiturage entre
salariés » / « Former tous les salariés à l'IA » (le seul mot « salariés »). Correctifs : mots
génériques, synonymes, racine, deux seuils. Une régression (« pannes » ≠ « panne » après
troncature) a été repérée en relançant la calibration. Cas figés dans `tests/duplicates.test.ts`.

**CI rouge, deux fois.** Premier échec de `npm ci` : l'IA a régénéré le lockfile et annoncé le
problème réglé après une vérification locale ; le run suivant a échoué de nouveau. La vraie cause
n'est apparue qu'en reproduisant l'environnement exact de la CI (`npx npm@10 ci --os=linux`) :
npm 10 (CI) et npm 11 (local) ne lisent pas le lockfile de la même façon. Correctif : la CI
installe npm 11.6.2. Une tentative de réparation par `npm install --package-lock-only` avait abîmé
le lockfile ; annulée avant commit.

**Autres.** Tailwind v4 refusait `@apply` sur des classes maison (passées en `@utility`) ; deux
tests faux réécrits (un mot absent des données, l'alignement des espaces dans le SQL).

## Tests (103, sans réseau ni Supabase)

- **Import :** 40 idées, identifiants conservés, `;` et BOM, champs vides, date française,
  guillemets, fichier invalide refusé, lignes défectueuses signalées.
- **Budgets libres :** `40 000 €`, `15k€`, `35k`, `30 000 euros`, `0`, `?`, vide, parenthèses.
- **Notation :** moyenne, notes 1–5, 4 critères obligatoires ; relancer l'IA ne modifie pas une
  note humaine.
- **Simulation IA :** déterminisme sur les 40 idées, justifications, alertes.
- **Doublons :** vrais doublons détectés, faux positifs connus exclus.
- **Shortlist :** sélection, classement, cible souple, export CSV (BOM, `;`, virgule décimale).
- **Couche Supabase :** aller-retour base ↔ modèle, import idempotent, note hors 1–5 refusée,
  clé secrète refusée, contrôle statique de la migration (RLS, rien pour `anon`).
- **Filtres et pagination :** recherche sans accents, « non renseigné », doublons, tris, pages.
- **IA réelle :** aucun nom d'auteur envoyé, idée trop longue refusée, route 503 / 401 / 403 /
  502 sans fuite d'erreur ; route exécutée en ESM Node comme sur Vercel.

**Vérifications manuelles.** Version locale (avant Supabase), dans Chrome : parcours complet, aucune
erreur console, rien ne déborde à 390 px. Contre la vraie base : accès anonyme refusé sur les
5 tables (HTTP 401). Parcours connecté fait à la main (captures). Version en ligne : routes
directes servies, `/api/score` 405 en GET et 503 en POST, CSV non servi, aucun nom d'auteur
dans le code publié. Pas de test automatisé de l'interface ni d'intégration contre une vraie base.

## Livraison

- Variables Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (ou
  `VITE_SUPABASE_ANON_KEY`), `VITE_AI_PROVIDER=mock`. `.env*` ignoré, seul `.env.example` versionné.
- **Activer un vrai modèle** : `ANTHROPIC_API_KEY` (variable serveur, sans `VITE_`), `AI_MODEL`
  optionnel, puis `VITE_AI_PROVIDER=http` et redéployer. L'envoi des idées à un fournisseur externe
  est à valider avec le client.
- Limites : une base = un challenge ; dernière sauvegarde gagnante si deux personnes notent la même
  idée ; CSV fictif présent dans le dépôt public ; bundle JS d'environ 570 Ko (supabase-js) ; un
  projet Supabase gratuit se met en pause après une semaine sans activité.

## Journal complet

Heure locale, 12/11/2026, d'après l'historique Git sauf mention contraire.

| Heure | Étape |
| --- | --- |
| 16:21 | Lecture du PDF et du CSV, audit des pièges de données, plan, installation |
| 16:21–16:40 | Domaine métier, IA simulée, calibration des doublons, interface |
| 16:40 | Trois commits : socle, domaine métier, interface (build vérifié) |
| 16:41–16:45 | Vérification manuelle dans Chrome |
| 16:46 | 65 tests, CI GitHub Actions |
| 16:49 | README ; push sur GitHub ; premier run CI en échec (`npm ci`) |
| 16:52 | Décision : persistance Supabase (Auth + RLS) |
| 16:52–17:05 | Première correction CI (lockfile), insuffisante ; migration, client typé, connexion ; 79 tests |
| entre 17:07 et 17:29 | Projet Supabase créé, migration appliquée, compte autorisé, accès anonyme refusé vérifié, 40 idées importées (hors Git) |
| 17:29 | Vraie cause CI trouvée (npm 10 vs 11) : CI verte |
| 17:34 | Pagination (15 par page) et filtre des doublons |
| entre 17:34 et 17:48 | Déploiement Vercel, variables Supabase, redéploiement (hors Git) |
| 17:48 | AGENTS.md / CLAUDE.md mis à jour |
| 18:05 | Branchement d'un vrai modèle IA préparé (inactif sans clé) ; 103 tests |
| 18:09–18:21 | Compte de démonstration, vérification en ligne, captures, README |
