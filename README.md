# IdeaPilot

Outil d'aide au dépouillement du challenge d'innovation Hexavia : consulter les 40 idées,
les noter sur la grille du client avec une proposition « IA » simulée, repérer les doublons
et sortir une shortlist d'environ 8 idées pour le jury.

## Aperçu

- **Application en ligne :** _à compléter après le déploiement Vercel_
- **Dépôt :** _à compléter_

_Captures : à ajouter depuis la version en ligne._

## Lancer l'outil

Prérequis : Node.js 20 ou plus.

```bash
npm install
npm run dev          # http://localhost:5173
```

Autres commandes : `npm test` (Vitest), `npm run typecheck`, `npm run build`.
Aucune variable d'environnement n'est nécessaire (voir `.env.example`).

## 1. Cadrage

**Le besoin.** Camille dépouille à la main, dans Excel, ~40 idées déposées par les salariés
d'Hexavia. Elle veut (1) les voir et les filtrer au même endroit, (2) les noter de façon
cohérente sur 4 critères de 1 à 5, (3) partir d'une proposition de l'IA qu'elle corrige,
(4) repérer les doublons, (5) envoyer au client une shortlist d'environ 8 idées. Le jury
est dans dix jours.

**Utilisatrice.** Camille, consultante non technique, seule à évaluer. Le client et le jury
reçoivent un export (CSV ou PDF), ils n'utilisent pas l'outil.

**Hypothèses** (pas de questions possibles pendant l'exercice) :

- Une seule évaluatrice, sur un seul poste : pas de comptes ni de partage en V1.
- Score final = **moyenne simple** des 4 critères, sans pondération (le brief n'en donne pas).
- Seules les notes **validées par Camille** comptent ; la proposition IA reste une aide.
- La stratégie d'Hexavia est inconnue : la simulation suppose comme prioritaires
  productivité, sécurité, énergie/environnement et service client.
- « Environ 8 » : l'outil signale l'écart à la cible (6 à 10 jugé « dans la cible ») sans bloquer.
- Le budget saisi librement est conservé tel quel ; un montant numérique est extrait
  uniquement pour aider à juger la faisabilité.
- Un doublon est **signalé, jamais fusionné** : Camille décide.
- Le CSV fourni est fictif ; il est donc versionné dans `public/data` et embarqué dans l'application.

**Dans la V1 :** tableau des idées (recherche, filtres direction / thème / site / statut, tri
par score ou date), fiche détaillée, notation 4 critères avec justification, proposition IA
simulée et justifiée, doublons avec score de similarité, shortlist, export CSV (Excel FR),
vue imprimable / PDF, import d'un autre CSV au même format (réutilisation pour d'autres
clients), sauvegarde automatique dans le navigateur.

**Reporté :** vrai modèle d'IA, comptes et travail à plusieurs, base de données partagée,
pondération des critères, fusion de doublons, historique des modifications.

## 2. Conception

```
CSV ──▶ data/csv.ts (Papa Parse) ──▶ Idea[] (lecture seule)
                                          │
        domain/ (pur, testé) : scoring, duplicates, filters, shortlist, workspace
                                          │
ai/AiScoringProvider ◀── MockAiScoringProvider      data/repository.ts (localStorage)
                                          │
              state/AppStore (contexte React) ──▶ pages/ (Idées, Fiche, Shortlist)
```

- **`src/domain`** contient toutes les règles métier, en TypeScript pur, sans React.
  C'est ce qui est testé.
- **Modèle de données** (`src/domain/types.ts`). `Idea` reprend le CSV (identifiants
  conservés, champs vides = `null`, `budgetRaw` + `budgetEstimateEur`, `submittedAtRaw` +
  `submittedAt`). Tout ce que l'outil produit est dans un `WorkspaceState` séparé, indexé
  par identifiant d'idée : `aiSuggestions` (`AiSuggestion` : notes, justification par
  critère, alertes, fournisseur, date), `evaluations` (`HumanEvaluation` : notes de Camille,
  commentaire, date de modification) et `shortlist` (`ShortlistSelection`). Les doublons
  (`DuplicateCandidate`), le statut et le score final sont **calculés**, jamais stockés.
  Cette séparation garantit que relancer l'IA ne peut pas écraser une note de Camille.
- **IA.** L'interface `AiScoringProvider` isole le fournisseur. `MockAiScoringProvider`
  applique des règles lisibles et déterministes (budget → faisabilité, thème → alignement,
  mots-clés → impact et innovation) et signale les informations manquantes. Elle se présente
  partout comme une simulation. Un vrai modèle se branchera via une fonction serveur
  détenant la clé (voir `src/ai/config.ts`), jamais côté navigateur.
- **Doublons.** Normalisation (accents, casse, ponctuation), mots vides, synonymes courants
  (chatbot → assistant…), racine naïve, puis similarité de Jaccard sur le texte complet
  (seuil 0,16) et sur le titre (seuil 0,5). Titre identique = 100 %. Seuils réglés sur
  l'export Hexavia et ajustables dans `src/domain/duplicates.ts`.
- **Persistance.** Interface `WorkspaceRepository` ; la V1 utilise `localStorage`, avec un
  espace séparé par fichier importé et un repli en mémoire si le stockage est bloqué.
  **Pourquoi pas Supabase en V1 :** sans authentification (hors périmètre), une clé publique
  Supabase n'aurait protégé ni les notes ni les noms des salariés. Le stockage local suffit
  pour une utilisatrice unique et évite d'envoyer des données personnelles à un serveur.
- **Stack.** React + TypeScript strict (stack INSKIP), Vite, Tailwind CSS, React Router
  (filtres conservés dans l'URL), Lucide, Papa Parse (CSV robuste : guillemets, BOM),
  Vitest, GitHub Actions, Vercel.

## 3. Construction avec l'IA

**Assistant :** Claude Code (modèle Claude Opus 5.5), dans le terminal, avec un fichier
d'instructions [`AGENTS.md`](AGENTS.md) (architecture, règles métier non négociables,
qualité). `CLAUDE.md` y renvoie.

**Prompts les plus utiles :**

1. Le brief de mission complet (rôle, stack, règles, 7 phases, critères d'acceptation),
   avec la consigne : « Ne commence pas par générer du code. Analyse d'abord les documents
   et inspecte l'environnement du projet. »
2. « Le score final ne doit jamais être remplacé silencieusement par la simulation IA. »
   Ce prompt a donné le stockage séparé `aiSuggestions` / `evaluations` et le test associé.
3. « Créer une détection lexicale simple […] seuil documenté et ajustable dans le code. »
   Il a déclenché une calibration sur les vraies données avant de fixer le seuil.
4. « Ne jamais inventer de résultats de tests, de commits, de déploiement ou d'événements
   du journal. »

**Quand l'IA s'est trompée.** Premier jet de la détection de doublons : un seul seuil de
Jaccard (0,25), choisi a priori. En affichant toutes les paires de l'export avec leur score,
on a vu qu'il **ratait** de vrais doublons (« Assistant IA pour les questions RH » /
« Chatbot RH » à 0,24 ; les deux idées sur les compresseurs à 0,20) et **signalait** un faux
(« Covoiturage entre salariés » / « Former tous les salariés à l'IA », rapprochés par le
seul mot « salariés »). Correctifs : mots génériques retirés, synonymes, racine des mots, et
deux seuils séparés (titre / texte complet), car les titres courts créaient du bruit à 0,20.
Une seconde régression est aussi apparue pendant ce réglage : la troncature des mots cassait
le pluriel (« pannes » ≠ « panne ») et faisait disparaître la paire des compresseurs. Elle a
été repérée en relançant la même calibration. Ces cas sont maintenant figés dans
`tests/duplicates.test.ts`.

Autres corrections : Tailwind v4 refusait `@apply` sur des classes maison (build cassé, classes
passées en `@utility`) ; un test de recherche était faux (il supposait un mot absent des
données) et a été réécrit.

## 4. Fiabilisation

65 tests Vitest (`tests/`), centrés sur ce qui fausserait le travail de Camille :

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
- **Persistance et filtres :** relecture, données corrompues, filtre « non renseigné », tris.

**CI** (`.github/workflows/ci.yml`) : à chaque push et pull request, `npm ci`, vérification
TypeScript, tests, build de production.

L'interface a été vérifiée à la main dans Chrome : chargement, pré-notation, validation,
persistance après rechargement, shortlist, filtres, aucune erreur console, pas de
débordement horizontal à 390 px de large. Il n'y a pas de test automatisé de l'interface.

## 5. Livraison

- Déploiement Vercel (preset Vite). `vercel.json` renvoie toutes les routes vers
  `index.html` (application monopage).
- Configuration : `VITE_AI_PROVIDER=mock` (valeur par défaut). Aucun secret dans le dépôt :
  `.env*` est ignoré, seul `.env.example` est versionné. Le brief INSKIP n'est pas republié.
- Données personnelles : noms des porteurs affichés et exportés (utile au jury), mais rien
  ne quitte le navigateur. Page marquée `noindex`.

**Ce qui manque avant de confier l'outil à Camille :**

- Les évaluations vivent dans **un seul navigateur** : changer de poste ou vider le cache les
  efface. Il faut donc un export/import de sauvegarde, ou Supabase avec authentification et
  politiques RLS.
- L'URL publique expose les 40 idées fictives à quiconque la connaît. Avec de vraies données,
  il faudra un accès protégé.
- Valider avec Camille les règles de la simulation et la grille de lecture des notes.

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
| _à venir_ | Dépôt GitHub, déploiement Vercel, captures |

## 7. Suite et questions pour Camille

**Avec une journée de plus :**

- Sauvegarde partagée (Supabase + authentification + RLS) ou, a minima, export/import d'une
  sauvegarde JSON.
- Vrai modèle via une fonction serveur, avec un prompt qui reprend la grille du client et
  fait citer le passage de l'idée qui justifie chaque note.
- Comparaison côte à côte de deux doublons, et possibilité de marquer « pas un doublon ».
- Tests d'interface (Testing Library / Playwright) sur le parcours principal.

**Questions pour Camille :**

1. Les 4 critères ont-ils le même poids pour Hexavia ? Y a-t-il un critère éliminatoire ?
2. Quels sont les axes stratégiques du groupe, pour régler l'« alignement » ?
3. Évaluez-vous seule, ou d'autres consultants notent-ils aussi (moyenne, arbitrage) ?
4. Quel format le client attend-il : CSV, PDF, ou une présentation ?
5. Les noms des porteurs doivent-ils figurer dans la shortlist envoyée au jury ?
6. Pour deux idées en doublon, faut-il retenir l'une, les fusionner ou réunir les porteurs ?
