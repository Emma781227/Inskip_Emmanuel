# IdeaPilot

Outil d'aide au dépouillement du challenge d'innovation Hexavia : consulter les 40 idées,
les noter sur la grille du client avec une proposition « IA » simulée, repérer les doublons
et sortir une shortlist d'environ 8 idées pour le jury.

## Aperçu

- **Application en ligne :** _à compléter après le déploiement Vercel_
- **Dépôt :** https://github.com/Emma781227/Inskip_Emmanuel
- **Compte de démonstration :** `inskip@gmail.com` / `Inskip237`
  (compte dédié à l'évaluation de l'exercice, données fictives ; à désactiver après la restitution)

_Captures : à ajouter depuis la version en ligne._

## Lancer l'outil

Prérequis : Node.js 20 ou plus, un projet Supabase (offre gratuite).

```bash
npm install
cp .env.example .env.local   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                  # http://localhost:5173
```

Première mise en place de la base (une seule fois, environ 3 minutes) :

1. **Schéma.** Dans Supabase > *SQL Editor*, exécuter
   [`supabase/migrations/20261112170000_init_ideapilot.sql`](supabase/migrations/20261112170000_init_ideapilot.sql)
   (ou `npx supabase link` puis `npx supabase db push`).
2. **Compte démonstrateur.** *Authentication > Users > Add user* (e-mail + mot de passe, « Auto confirm »).
   Désactiver les inscriptions publiques (*Authentication > Sign In / Providers > Allow new users to sign up*).
3. **Autoriser ce compte.** Dans le SQL Editor :
   `insert into public.team_members (user_id) select id from auth.users where email = 'demo@exemple.fr';`
4. **Import initial.** Se connecter à l'application, cliquer « Importer le fichier des idées » et choisir
   `data/idees_hexavia.csv`. L'import est **idempotent** : le relancer met à jour les 40 idées sans en
   créer de nouvelles et sans toucher aux évaluations.

Autres commandes : `npm test` (Vitest), `npm run typecheck`, `npm run build`.
Sans configuration Supabase, l'application affiche un écran « Configuration requise » au lieu de planter.

## 1. Cadrage

**Le besoin.** Camille dépouille à la main, dans Excel, une quarantaine d'idées déposées par les
salariés d'Hexavia. Elle veut (1) les voir et les filtrer au même endroit, (2) les noter de façon
cohérente sur 4 critères de 1 à 5, (3) partir d'une proposition de l'IA qu'elle corrige,
(4) repérer les doublons, (5) envoyer au client une shortlist d'environ 8 idées. Le jury
est dans dix jours.

**Utilisatrice.** Camille, consultante non technique. Le client et le jury reçoivent un export
(CSV ou PDF) ; ils n'utilisent pas l'outil.

**Hypothèses** (pas de questions possibles pendant l'exercice) :

- Une équipe restreinte (Camille, éventuellement un collègue) partage **une** base par challenge :
  une évaluation par idée, la dernière enregistrée fait foi.
- Score final = **moyenne simple** des 4 critères, sans pondération (le brief n'en donne pas).
- Seules les notes **validées par Camille** comptent ; la proposition IA reste une aide.
- La stratégie d'Hexavia est inconnue : la simulation suppose comme prioritaires
  productivité, sécurité, énergie/environnement et service client.
- « Environ 8 » : l'outil signale l'écart à la cible (6 à 10 jugé « dans la cible ») sans bloquer.
- Le budget saisi librement est conservé tel quel ; un montant numérique est extrait
  uniquement pour aider à juger la faisabilité.
- Un doublon est **signalé, jamais fusionné** : Camille décide.
- Le CSV fourni est fictif : il est versionné dans `data/` pour les tests et l'import, mais
  **n'est pas servi** par l'application. Les noms des auteurs ne sont lisibles qu'après connexion.

**Dans la V1 :** tableau des idées (recherche, filtres direction / thème / site / statut, tri
par score ou date), fiche détaillée, notation 4 critères avec justification, proposition IA
simulée et justifiée, doublons avec score de similarité, shortlist, export CSV (Excel FR),
vue imprimable / PDF, import CSV idempotent (réutilisable pour d'autres clients), connexion
Supabase Auth, sauvegarde dans Supabase avec indicateur d'enregistrement.

**Reporté :** vrai modèle d'IA, plusieurs évaluateurs par idée (notes individuelles +
consolidation), plusieurs challenges dans une même base, rôles (lecture seule pour le client),
pondération des critères, fusion de doublons, historique des modifications.

## 2. Conception

```
CSV ──▶ data/csv.ts (Papa Parse) ──▶ Idea[]
                                        │
      domain/ (pur, testé) : scoring, duplicates, filters, shortlist, workspace
                                        │
ai/AiScoringProvider ◀── Mock…   data/repository.ts ──▶ Supabase (Postgres + RLS)
                                        │      ▲ mappers.ts (ligne ↔ modèle)
  state/AppStore (session, chargement, écritures) ──▶ AuthGate ──▶ pages/
```

- **`src/domain`** contient toutes les règles métier, en TypeScript pur, sans React ni Supabase.
  C'est ce qui est testé.
- **Modèle métier** (`src/domain/types.ts`). `Idea` reprend le CSV (identifiants conservés, champs
  vides = `null`, `budgetRaw` + `budgetEstimateEur`, `submittedAtRaw` + `submittedAt`).
  `AiSuggestion` (notes proposées, justification par critère, alertes, fournisseur, date),
  `HumanEvaluation` (notes de Camille, commentaire, date de modification) et `ShortlistSelection`
  sont séparés. Doublons (`DuplicateCandidate`), statut et score final sont **calculés**, jamais
  stockés. Cette séparation garantit que relancer l'IA ne peut pas écraser une note de Camille.
- **Persistance : Supabase** (stack INSKIP), sans backend à écrire. Migration versionnée dans
  `supabase/migrations/` :

  | Table | Contenu | Clé |
  | --- | --- | --- |
  | `ideas` | export du formulaire, budget et date bruts conservés | `id` = identifiant métier du CSV |
  | `ai_suggestions` | notes 1–5 proposées, justifications (`jsonb`), alertes, fournisseur | `idea_id` → `ideas` |
  | `evaluations` | notes 1–5 validées, commentaire, auteur, `created_at` / `updated_at` | `idea_id` → `ideas` |
  | `shortlist` | sélection pour le jury, auteur, date | `idea_id` → `ideas` |
  | `team_members` | comptes autorisés | `user_id` → `auth.users` |

  Contraintes `CHECK` sur les notes, index sur direction / thème / site / date, `updated_at` mis à
  jour par trigger. L'application parle à une interface `IdeaPilotRepository` ; `SupabaseRepository`
  l'implémente et `mappers.ts` convertit (et revalide) les lignes. Une écriture n'apparaît comme
  enregistrée qu'une fois confirmée par le serveur.
- **Sécurité.** RLS activée sur toutes les tables, aucun droit pour `anon`. Lire ou écrire exige
  d'être connecté **et** inscrit dans `team_members` (fonction `is_team_member()`) : si les
  inscriptions restaient ouvertes par erreur, un nouveau compte ne pourrait toujours pas lire les
  noms. Aucune politique `delete` sur `ideas`. Le navigateur ne reçoit que l'URL et la clé
  **publique** (publishable, ou anon en compatibilité) ; l'application refuse de démarrer si on
  lui donne une clé secrète.
- **IA.** L'interface `AiScoringProvider` isole le fournisseur, choisi par `VITE_AI_PROVIDER` :
  - `mock` (défaut, V1) : `MockAiScoringProvider` applique des règles lisibles et déterministes
    (budget → faisabilité, thème → alignement, mots-clés → impact et innovation), signale les
    informations manquantes et se présente partout comme une simulation ;
  - `http` (prêt, inactif) : `HttpAiScoringProvider` appelle la fonction Vercel `api/score.ts`.
    Celle-ci vérifie la session Supabase **et** l'appartenance à l'équipe, valide l'idée, puis
    appelle Claude (`claude-opus-5-5` par défaut, SDK officiel, sortie JSON imposée par un schéma
    Zod, repli automatique de l'API si le modèle décline). La clé `ANTHROPIC_API_KEY` ne vit que
    sur le serveur ; sans elle, la route répond 503 et l'interface l'explique.
  Seul le contenu de l'idée est envoyé au modèle, **jamais le nom de son auteur**. Les notes du
  modèle restent des propositions : même séparation, même validation 1–5 que pour la simulation.
- **Doublons.** Normalisation (accents, casse, ponctuation), mots vides, synonymes courants
  (chatbot → assistant…), racine naïve, puis similarité de Jaccard sur le texte complet
  (seuil 0,16) et sur le titre (seuil 0,5). Titre identique = 100 %. Seuils réglés sur
  l'export Hexavia et ajustables dans `src/domain/duplicates.ts`.
- **Stack.** React + TypeScript strict (stack INSKIP), Vite, Tailwind CSS, React Router
  (filtres conservés dans l'URL), Lucide, Papa Parse (CSV robuste : guillemets, BOM),
  `@supabase/supabase-js` (types de base dans `database.types.ts`), Vitest, GitHub Actions, Vercel.

## 3. Construction avec l'IA

**Assistant :** Claude Code (modèle Claude Opus 5.5), dans le terminal, avec un fichier
d'instructions [`AGENTS.md`](AGENTS.md) (architecture, règles métier non négociables,
sécurité, qualité). `CLAUDE.md` y renvoie.

**Prompts les plus utiles :**

1. Le brief de mission complet (rôle, stack, règles, 7 phases, critères d'acceptation),
   avec la consigne : « Ne commence pas par générer du code. Analyse d'abord les documents
   et inspecte l'environnement du projet. »
2. « Le score final ne doit jamais être remplacé silencieusement par la simulation IA. »
   Ce prompt a donné le stockage séparé des propositions IA et des évaluations, et le test associé.
3. « Créer une détection lexicale simple […] seuil documenté et ajustable dans le code. »
   Il a déclenché une calibration sur les vraies données avant de fixer le seuil.
4. « Ne jamais inventer de résultats de tests, de commits, de déploiement ou d'événements
   du journal. »
5. Le changement d'architecture en cours de route : « Supabase est désormais notre solution
   principale de persistance […] configurer des politiques RLS qui protègent les lectures et
   écritures. Ne pas exposer publiquement les noms des auteurs. » Ce prompt a conduit à retirer
   le CSV des fichiers publics et à ajouter la liste `team_members`.

**Quand l'IA s'est trompée.** Premier jet de la détection de doublons : un seul seuil de
Jaccard (0,25), choisi a priori. En affichant toutes les paires de l'export avec leur score,
on a vu qu'il **ratait** de vrais doublons (« Assistant IA pour les questions RH » /
« Chatbot RH » à 0,24 ; les deux idées sur les compresseurs à 0,20) et **signalait** un faux
(« Covoiturage entre salariés » / « Former tous les salariés à l'IA », rapprochés par le
seul mot « salariés »). Correctifs : mots génériques retirés, synonymes, racine des mots, et
deux seuils séparés (titre / texte complet), car les titres courts créaient du bruit à 0,20.
Une régression est aussi apparue pendant ce réglage : la troncature des mots cassait le pluriel
(« pannes » ≠ « panne ») et faisait disparaître la paire des compresseurs. Elle a été repérée en
relançant la même calibration. Ces cas sont maintenant figés dans `tests/duplicates.test.ts`.

**La CI rouge.** Le premier run GitHub Actions a échoué à `npm ci`. L'annotation GitHub ne
donnait que « exit code 1 ». En rejouant `npm ci` dans un dossier vierge, on a obtenu la vraie
cause : un lockfile désynchronisé (`Missing: @emnapi/wasi-threads`, une dépendance optionnelle
que npm sous Windows n'avait pas enregistrée). Le lockfile a été régénéré, puis `npm ci` a été
revérifié à blanc. Leçon retenue : un build local vert ne garantit pas `npm ci` en CI.

Autres corrections : Tailwind v4 refusait `@apply` sur des classes maison (build cassé, classes
passées en `@utility`) ; deux tests faux ont été réécrits (l'un supposait un mot absent des
données, l'autre ne tolérait pas l'alignement des espaces dans le SQL).

## 4. Fiabilisation

103 tests Vitest (`tests/`), centrés sur ce qui fausserait le travail de Camille. Ils tournent
**sans Supabase ni réseau** : la logique métier est pure, la couche données est testée par ses
conversions, et la fonction serveur IA par injection de dépendances.

- **Import :** 40 idées, identifiants IDEA-001 à 040 conservés, séparateur `;` et BOM,
  champs vides → `null`, date au format français, champs entre guillemets, fichier invalide
  refusé avec un message clair, lignes défectueuses signalées.
- **Budgets libres :** `40 000 €`, `15k€`, `35k`, `30 000 euros`, `0`, `?`, vide, texte
  entre parenthèses ; le texte brut est toujours conservé.
- **Notation :** moyenne simple, notes entières 1–5, 4 critères obligatoires ; une
  suggestion IA seule ne donne pas de score ; **relancer l'IA ne modifie pas une note humaine**.
- **Simulation IA :** déterminisme sur les 40 idées, notes valides, justification par
  critère, alertes pour informations manquantes.
- **Doublons :** titres identiques, reformulations attendues détectées, faux positifs
  connus exclus.
- **Shortlist :** sélection / désélection, classement, cible souple, export CSV (BOM, `;`,
  virgule décimale, uniquement les idées retenues).
- **Couche Supabase (sans réseau) :** aller-retour base ↔ modèle sur les 40 idées, import
  idempotent (fichier importé deux fois = 40 lignes), refus d'une note hors 1–5 lue en base,
  clé publishable / anon acceptée et **clé secrète refusée**, contrôle statique de la migration
  (RLS sur chaque table, rien pour `anon`, contraintes 1–5, pas de suppression d'idée).
- **Filtres et pagination :** recherche sans accents, filtre « non renseigné », statut, doublons,
  tris ; 15 idées par page, page hors bornes corrigée.
- **IA réelle (préparée) :** aucun nom d'auteur envoyé au modèle, idée trop longue refusée (pas
  tronquée), note hors 1–5 du modèle refusée, schéma de sortie, route serveur : 503 sans clé
  (modèle jamais appelé), 401 sans session, 403 hors équipe, 502 sans fuite du détail d'erreur ;
  côté navigateur : jeton envoyé, erreurs traduites, réponse revalidée.
  La route a aussi été compilée et exécutée en ESM Node comme sur Vercel : 503 `not_configured`.

**CI** (`.github/workflows/ci.yml`) : à chaque push et pull request, `npm ci`, vérification
TypeScript, tests, build de production.

**Vérifications manuelles.** Sur la version précédente (stockage local), dans Chrome :
pré-notation, validation, persistance après rechargement, shortlist, filtres, aucune erreur
console, pas de débordement horizontal à 390 px. Sur la version Supabase, seul l'écran
« Configuration requise » est vérifié à ce stade. Il n'y a ni test automatisé de l'interface,
ni test d'intégration contre une vraie base.

## 5. Livraison

- Déploiement Vercel (preset Vite). `vercel.json` renvoie toutes les routes vers
  `index.html` (application monopage).
- Variables (Vercel > Settings > Environment Variables, et `.env.local` en local) :
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY` si le projet
  n'a que l'ancienne clé), `VITE_AI_PROVIDER=mock`. Aucun secret dans le dépôt : `.env*` est
  ignoré, seul `.env.example` est versionné. Le brief INSKIP n'est pas republié.
- Données personnelles : noms des porteurs visibles et exportés uniquement par les comptes
  autorisés ; le fichier source n'est pas servi par l'application ; page marquée `noindex`.
- **Compte de démonstration publié dans ce README** pour faciliter l'évaluation : choix assumé
  pour un exercice aux données fictives. Avec de vraies données, il ne faudrait jamais publier
  d'identifiants : comptes nominatifs créés par l'administrateur, mot de passe transmis à part.
  Après la restitution, désactiver ce compte (Supabase > Authentication) et le retirer de `team_members`.

**Activer un vrai modèle plus tard** (aucun code à écrire) :

1. Vercel > Environment Variables : `ANTHROPIC_API_KEY` (sans préfixe `VITE_`), optionnellement
   `AI_MODEL` (défaut `claude-opus-5-5`).
2. Passer `VITE_AI_PROVIDER` à `http`, puis redéployer.
3. Tester « Proposer une note IA » sur une idée : la note affichée est marquée « modèle de langage ».

Point d'attention : l'envoi du contenu des idées à un fournisseur externe est à valider avec le
client (données internes Hexavia), même sans les noms des auteurs.

**Ce qui manque avant de confier l'outil à Camille :**

- Créer le compte de Camille (pas un compte partagé) et lui montrer l'outil en 10 minutes.
- Une base = un challenge : pour un autre client, il faut un nouveau projet Supabase (ou
  ajouter une table `challenges`).
- Si deux personnes notent la même idée en même temps, la dernière sauvegarde l'emporte.
- Le dépôt GitHub public contient le CSV fictif (noms inventés) : à retirer pour de vraies données.
- Le bundle JS fait environ 565 Ko (avertissement Vite, surtout dû à supabase-js) ; aucune gêne
  constatée, mais un découpage serait possible.

## 6. Journal

Heures réelles (heure locale, 12/11/2026, d'après l'historique Git) :

| Heure | Étape |
| --- | --- |
| 16:21 | Lecture du PDF et du CSV, audit des pièges de données, plan, installation |
| 16:21–16:40 | Domaine métier, IA simulée, calibration des doublons sur les données, interface |
| 16:40 | Trois commits : socle, domaine métier, interface (build vérifié) |
| 16:41 | CSV conservé à l'octet près (`.gitattributes`) |
| 16:41–16:45 | Vérification manuelle dans Chrome (pré-notation, évaluation, persistance, shortlist) |
| 16:46 | 65 tests, CI GitHub Actions |
| 16:47 | Libellés IA et filtres mobiles affinés après revue visuelle |
| 16:49 | README ; push sur GitHub ; premier run CI **en échec** (`npm ci`) |
| 16:52 | Décision : passer la persistance sur Supabase (Auth + RLS) |
| 16:52–17:05 | Cause de l'échec CI reproduite et corrigée (lockfile) ; migration SQL, client typé, connexion, états de sauvegarde ; 79 tests |
| 17:05 | Trois commits Supabase (schéma et configuration, interface, tests) |
| _à venir_ | Projet Supabase configuré, déploiement Vercel, vérification en ligne, captures |

## 7. Suite et questions pour Camille

**Avec une journée de plus :**

- Brancher la clé du modèle et construire un petit jeu d'évaluation (idées notées par Camille)
  pour comparer simulation et modèle avant de s'y fier ; limiter le débit de `/api/score`.
- Notes par évaluateur (une ligne par personne) et vue de consolidation ; rôle « lecture
  seule » pour le client.
- Test d'intégration de la RLS contre une base Supabase locale (`supabase start`).
- Comparaison côte à côte de deux doublons, et possibilité de marquer « pas un doublon ».
- Tests d'interface (Testing Library / Playwright) sur le parcours principal.

**Questions pour Camille :**

1. Les 4 critères ont-ils le même poids pour Hexavia ? Y a-t-il un critère éliminatoire ?
2. Quels sont les axes stratégiques du groupe, pour régler l'« alignement » ?
3. Évaluez-vous seule, ou d'autres consultants notent-ils aussi (moyenne, arbitrage) ?
4. Quel format le client attend-il : CSV, PDF, ou une présentation ?
5. Les noms des porteurs doivent-ils figurer dans la shortlist envoyée au jury ?
6. Pour deux idées en doublon, faut-il retenir l'une, les fusionner ou réunir les porteurs ?
