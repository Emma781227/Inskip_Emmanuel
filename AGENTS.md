# AGENTS.md — conventions pour les assistants de code (Claude Code, Codex…)

IdeaPilot aide Camille, consultante non technique, à évaluer les idées d'un challenge
d'innovation (cas Hexavia, 40 idées). React + TypeScript strict + Vite + Tailwind v4,
persistance Supabase (Auth + RLS), déploiement Vercel, CI GitHub Actions.

## Commandes

```bash
npm install
npm run dev        # http://localhost:5173 (lit .env.local au démarrage)
npm run typecheck  # tsc -b (strict)
npm test           # vitest run — aucun accès réseau ni Supabase nécessaire
npm run build      # typecheck + build de production
```

Avant tout commit : `npm run typecheck && npm test && npm run build` doivent passer.

## Architecture (respecter les frontières)

- `src/domain/` — logique métier **pure** (pas de React, pas de Supabase, pas de `window`) :
  types, normalisation, notation, doublons, filtres + pagination, shortlist/export.
  Toute règle métier vit ici et est testée.
- `src/data/` — entrées/sorties : lecture du CSV (Papa Parse), configuration et client Supabase,
  types de base écrits à la main (`database.types.ts`), conversions ligne ↔ modèle (`mappers.ts`),
  `IdeaPilotRepository` (interface) / `SupabaseRepository` (implémentation).
- `supabase/migrations/` — schéma SQL versionné, appliqué à la main dans le SQL Editor Supabase.
- `src/ai/` — `AiScoringProvider` (contrat) et `MockAiScoringProvider` (simulation déterministe).
- `src/state/AppStore.tsx` — session, chargement, écritures ; orchestre, ne contient pas de règle métier.
- `src/components/`, `src/pages/` — interface uniquement. `AuthGate` (config / connexion / accès),
  `DataGate` (chargement / erreur / base vide).

## Règles métier non négociables

1. Propositions IA (`ai_suggestions`) et notes de Camille (`evaluations`) sont dans deux tables
   distinctes. **Aucune action IA ne modifie une évaluation humaine.**
2. Score final = moyenne arithmétique des 4 notes **validées par Camille**. Une suggestion IA
   seule ne produit jamais de score final.
3. Notes entières de 1 à 5, les 4 critères obligatoires pour valider (contrainte aussi en base).
4. La simulation IA est déterministe et se présente comme une simulation, jamais comme un LLM.
5. Les doublons sont signalés, jamais fusionnés ni supprimés.
6. `budgetRaw` et `submittedAtRaw` gardent la saisie d'origine ; `data/idees_hexavia.csv` n'est jamais modifié.
7. La shortlist vise « environ 8 » idées : indication, pas contrainte.
8. L'identifiant métier du CSV (`IDEA-001`…) est la clé ; l'import est un upsert idempotent sur `id`.

## Interface

- Libellés en français, compréhensibles par une personne non technique.
- Chaque vue prévoit chargement / erreur / vide / succès. Une écriture n'est affichée comme
  enregistrée qu'après confirmation du serveur (pas d'optimisme).
- Filtres, tri et page du tableau vivent dans l'URL (`useSearchParams`) ; changer un filtre
  ramène à la page 1. Taille de page : `PAGE_SIZE` (15) dans `src/domain/filters.ts`.
- Vérifier la largeur mobile (390 px) : pas de défilement horizontal.

## Qualité

- TypeScript strict, pas de `any`. `noUncheckedIndexedAccess` est activé.
- Pas d'état React dupliqué : score, statut, doublons, pages sont calculés.
- Pas de nouvelle dépendance sans justification.
- Toute logique ajoutée dans `src/domain` ou `src/data` s'accompagne d'un test dans `tests/`.
- Les tests ne doivent jamais dépendre du réseau ni d'une base Supabase.

## Supabase

- Toute évolution de schéma = **nouvelle** migration (ne jamais modifier une migration déjà
  appliquée) + mise à jour de `src/data/database.types.ts` (des `type`, pas des `interface` :
  supabase-js exige des `Record<string, unknown>`).
- Toute nouvelle table : RLS activée, rien pour `anon`, politiques fondées sur `is_team_member()`.
  Le test `tests/supabase-data.test.ts` vérifie ces règles statiquement sur les migrations.
- Ajouter un utilisateur = le créer dans Authentication **puis** l'insérer dans `team_members`.

## Sécurité et données

- Aucun secret dans le dépôt. `.env.example` ne contient **que des valeurs factices** ;
  la vraie configuration est dans `.env.local` (ignoré) et dans les variables Vercel.
- Côté navigateur : uniquement `VITE_SUPABASE_URL` et la clé PUBLIQUE (`VITE_SUPABASE_PUBLISHABLE_KEY`,
  ou `VITE_SUPABASE_ANON_KEY` en compatibilité). Jamais de `service_role` / `sb_secret_…`
  (l'application refuse d'ailleurs de démarrer avec).
- Le CSV (noms d'auteurs) n'est jamais servi publiquement (pas dans `public/`) : il est importé
  depuis l'application par un membre connecté.
- Aucune clé de modèle IA préfixée `VITE_` : un vrai fournisseur passera par une fonction serveur.
- Ne pas envoyer les données (noms d'auteurs) à un service tiers autre que la base Supabase du projet.

## Pièges déjà rencontrés (à ne pas reproduire)

- **npm / lockfile.** La CI force npm 11.6.2 : npm 10 et 11 ne lisent pas le lockfile de la même
  façon (`Missing: @emnapi/core`). Ne jamais régénérer le lockfile avec `--package-lock-only`
  (il a perdu des dépendances optionnelles). Après toute modification des dépendances, vérifier
  `npm ci` dans un dossier vierge avant de pousser.
- **Tailwind v4.** `@apply` ne peut pas réutiliser une classe maison déclarée en `@layer components` :
  déclarer les classes réutilisables avec `@utility` (voir `src/index.css`).
- **Variables Vite.** Les `VITE_*` sont figées au build : après un changement dans Vercel,
  il faut redéployer ; en local, relancer `npm run dev`.
- **Doublons.** Les seuils (`DUPLICATE_THRESHOLDS`) sont calibrés sur l'export réel. Avant de les
  modifier, afficher toutes les paires avec leur score sur `data/idees_hexavia.csv` et relancer
  `tests/duplicates.test.ts` (vrais doublons attendus et faux positifs connus y sont figés).
- **Tests.** Une assertion qui échoue peut venir du test lui-même : vérifier les données avant de
  « corriger » le code.

## Méthode

Petites étapes, un commit cohérent par étape, message en français à l'impératif.
Ne jamais annoncer un résultat (tests, CI, déploiement) sans l'avoir vérifié.
Ne pas utiliser de vraie clé API de modèle ; ne jamais committer `.env*` (sauf `.env.example`).
