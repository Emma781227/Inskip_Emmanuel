# CLAUDE.md

Les conventions du projet sont dans [AGENTS.md](AGENTS.md) : lis-le avant toute modification.
Ce fichier ne contient que ce qui est propre à Claude Code dans ce dépôt.

## Environnement

- Poste Windows ; le terminal Bash est Git Bash. Préférer les outils d'édition de fichiers
  aux scripts shell multi-lignes pour modifier le code.
- `npm run dev` peut déjà tourner sur le port 5173 : vérifier avant d'en lancer un second.

## Vérifier sans deviner

- Après une modification : `npm run typecheck`, `npm test`, `npm run build`.
- Après une modification de dépendances : `npm ci` dans un dossier vierge (voir AGENTS.md, npm 11.6.2).
- État de la CI : API publique GitHub (`/repos/Emma781227/Inskip_Emmanuel/actions/runs`).
- Interface : l'application exige une connexion Supabase. Ne pas saisir de mot de passe ;
  demander à l'utilisateur de se connecter, ou vérifier ce qui est visible sans connexion
  (écran de connexion, refus d'accès `anon` via l'API REST avec la clé publique).

## Limites d'action

- Ne jamais committer `.env.local` ni une vraie clé dans `.env.example`.
- Création de comptes, migrations à appliquer, variables Vercel : actions de l'utilisateur.
  Lui donner les étapes exactes plutôt que de les contourner.
- Demander avant de pousser si l'utilisateur ne l'a pas demandé explicitement.
