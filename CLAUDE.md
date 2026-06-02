# Skyjo Discord Activity — Guide Claude Code

## Stack

- Next.js (App Router, JavaScript)
- Socket.io (serveur custom dans server.js)
- Prisma + PostgreSQL
- Discord Embedded App SDK (@discord/embedded-app-sdk)

## Règles du projet

- Toujours JavaScript, jamais TypeScript
- Pas de `src/` directory, structure à plat
- Serveur custom : `server.js` à la racine (Next.js + Socket.io combinés)
- State de jeu en mémoire dans server.js (Map/objet), Prisma uniquement pour persistance scores/historique

## Règles Skyjo (2–11 joueurs)

- Deck : 150 cartes (-2 ×5, -1 ×10, 0 ×15, 1–12 ×10 chacun)
- Grille par joueur : 3 lignes × 4 colonnes = 12 cartes
- Début : 2 cartes retournées par joueur
- Tour : piocher (deck ou défausse) → remplacer une carte OU retourner une carte (si pris sur défausse, remplacer obligatoire)
- Colonne complète identique → élimination immédiate
- Fin de manche : un joueur retourne sa dernière carte → tous les autres jouent encore 1 tour
- Pénalité : si le joueur qui a déclenché la fin n'a pas le score le plus bas → son score est doublé
- Fin de partie : un joueur atteint ou dépasse 100 points → celui avec le moins de points gagne

## Structure des fichiers cible

- server.js — serveur Express + Socket.io + logique de jeu
- app/page.js — lobby / écran d'accueil
- app/game/page.js — plateau de jeu
- app/components/ — composants UI (PlayerGrid, Card, GameLog, etc.)
- lib/gameEngine.js — fonctions pures Skyjo (calculs, validations)
- prisma/schema.prisma — Game, Round, PlayerScore
- .env.local — DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DATABASE_URL

## Max joueurs

11 (à configurer aussi dans le Discord Developer Portal → Activities → Max Participants : 11)

## Events Socket.io attendus

### Client → Serveur

- join_game : { discordUserId, username, avatar, instanceId }
- start_game
- draw_from_deck
- draw_from_discard
- place_card : { row, col }
- discard_drawn_card
- reveal_card : { row, col }

### Serveur → Client

- game_state : état complet de la partie
- your_turn : { playerId, actions }
- card_drawn : { card } (visible que du joueur concerné)
- game_over : { scores, winner }
- error : { message }
