# AGENTS.md — conventions pour les assistants de code (Claude Code, Codex…)

IdeaPilot aide Camille, consultante non technique, à évaluer les idées d'un challenge
d'innovation. Le cahier des charges est `Cas pratique stage développeur INSKIP.pdf`.

## Commandes

```bash
npm install
npm run dev        # serveur local
npm run typecheck  # tsc -b (strict)
npm test           # vitest run
npm run build      # typecheck + build de production
```

Avant tout commit : `npm run typecheck && npm test && npm run build` doivent passer.

## Architecture (respecter les frontières)

- `src/domain/` — logique métier **pure** (pas de React, pas de `window`) : types, normalisation,
  notation, doublons, filtres, shortlist/export. Toute règle métier vit ici et est testée.
- `src/data/` — entrées/sorties : lecture du CSV (Papa Parse), repository de persistance.
- `src/ai/` — `AiScoringProvider` (contrat) et `MockAiScoringProvider` (simulation déterministe).
- `src/state/` — orchestration React (contexte unique `AppStore`), sans règle métier.
- `src/components/`, `src/pages/` — interface uniquement.

## Règles métier non négociables

1. Les notes IA (`aiSuggestions`) et les notes de Camille (`evaluations`) sont stockées
   séparément. **Aucune action IA ne modifie une évaluation humaine.**
2. Le score final = moyenne arithmétique des 4 notes **validées par Camille**. Une suggestion IA
   seule ne produit jamais de score final.
3. Notes entières de 1 à 5, les 4 critères obligatoires pour valider.
4. La simulation IA est déterministe et se présente comme une simulation, jamais comme un LLM.
5. Les doublons sont signalés, jamais fusionnés ni supprimés.
6. Le CSV source n'est jamais modifié ; `budgetRaw` et `submittedAtRaw` gardent la saisie d'origine.
7. La shortlist vise « environ 8 » idées : indication, pas contrainte.

## Qualité

- TypeScript strict, pas de `any`. `noUncheckedIndexedAccess` est activé.
- Pas d'état React dupliqué : les valeurs dérivées (score, statut, doublons) sont calculées.
- Libellés d'interface en français, clairs pour une personne non technique.
- Prévoir les états chargement / erreur / vide / succès pour chaque vue.
- Pas de nouvelle dépendance sans justification.
- Toute logique ajoutée dans `src/domain` ou `src/data` s'accompagne d'un test dans `tests/`.

## Sécurité et données

- Aucun secret dans le dépôt. Seul `.env.example` est versionné.
- Aucune clé de modèle ne doit être préfixée `VITE_` (elle serait exposée au navigateur) :
  un vrai fournisseur IA passera par une fonction serveur.
- Les données (noms d'auteurs) restent dans le navigateur ; ne pas les envoyer à un service tiers.

## Méthode

Petites étapes, un commit cohérent par étape, message en français à l'impératif.
Ne jamais annoncer un résultat (tests, déploiement) sans l'avoir vérifié.
