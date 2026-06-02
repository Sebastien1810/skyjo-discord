const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const prisma = require("./lib/prisma");
const {
  createDeck, shuffle, dealGrid,
  checkColumnsToRemove, removeColumns,
  allFaceUp, roundScore, visibleScore,
} = require("./lib/gameEngine");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = process.env.PORT || 3000;

// =============================================================================
// ÉTAT EN MÉMOIRE
// =============================================================================
const games = new Map();          // instanceId → gameState
const socketToPlayer = new Map(); // socketId   → { instanceId, playerId }

function createGame(instanceId) {
  return {
    instanceId,
    phase: "waiting",
    players: [],
    deck: [],
    discardPile: [],
    topDiscard: null,
    currentPlayerIndex: 0,
    turnPhase: "draw",
    drawnCard: null,
    drawnFrom: null,
    roundNumber: 1,
    lastRoundTriggerId: null,
    lastRoundRemaining: [],
    log: [],
    prismaGameId: null,
  };
}

// =============================================================================
// HELPERS
// =============================================================================
function sanitizeForPlayer(game, forPlayerId) {
  const isCurrentPlayer = game.players[game.currentPlayerIndex]?.id === forPlayerId;
  return {
    instanceId: game.instanceId,
    phase: game.phase,
    roundNumber: game.roundNumber,
    currentPlayerIndex: game.currentPlayerIndex,
    turnPhase: game.turnPhase,
    drawnCard: isCurrentPlayer ? game.drawnCard : (game.drawnCard !== null ? "hidden" : null),
    drawnFrom: game.drawnFrom,
    topDiscard: game.topDiscard,
    deckCount: game.deck.length,
    discardPileCount: game.discardPile.length,
    lastRoundTriggerId: game.lastRoundTriggerId,
    lastRoundRemaining: game.lastRoundRemaining,
    log: game.log,
    players: game.players.map(p => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      cumulativeScore: p.cumulativeScore,
      initialReveals: p.initialReveals,
      isConnected: p.isConnected,
      grid: p.grid.map(row =>
        row.map(card => ({ faceUp: card.faceUp, value: card.faceUp ? card.value : null }))
      ),
    })),
  };
}

function broadcastGameState(io, game) {
  game.players.forEach(p => {
    if (p.socketId && p.isConnected) {
      io.to(p.socketId).emit("game_state", sanitizeForPlayer(game, p.id));
    }
  });
}

function addLog(game, message) {
  game.log.unshift({ time: Date.now(), message });
  if (game.log.length > 30) game.log.pop();
}

function syncDiscardTop(game) {
  game.topDiscard = game.discardPile.length > 0
    ? game.discardPile[game.discardPile.length - 1]
    : null;
}

function ensureDeck(game) {
  if (game.deck.length === 0) {
    const top = game.discardPile.pop();
    game.deck = shuffle(game.discardPile);
    game.discardPile = top !== undefined ? [top] : [];
    syncDiscardTop(game);
  }
}

function resendYourTurn(io, game, player) {
  if (!player.socketId || !player.isConnected) return;
  if (game.players[game.currentPlayerIndex]?.id !== player.id) return;
  if (game.phase !== "playing" && game.phase !== "last_round") return;

  let actions;
  if (game.turnPhase === "draw") {
    actions = ["draw_from_deck", "draw_from_discard"];
  } else if (game.drawnCard !== null) {
    actions = game.drawnFrom === "deck"
      ? ["place_card", "discard_drawn_card"]
      : ["place_card"];
  } else {
    actions = ["reveal_card"];
  }
  io.to(player.socketId).emit("your_turn", { playerId: player.id, actions });
  if (game.drawnCard !== null) {
    io.to(player.socketId).emit("card_drawn", { card: game.drawnCard });
  }
}

// =============================================================================
// PRISMA (non-bloquant — les erreurs DB ne cassent pas la partie)
// =============================================================================
async function dbCreateGame(instanceId) {
  try {
    const record = await prisma.game.create({ data: { instanceId } });
    return record.id;
  } catch (e) {
    console.error("[prisma] game.create:", e.message);
    return null;
  }
}

async function dbSaveRound(game, roundNumber, finalScores, penalty) {
  if (!game.prismaGameId) return;
  try {
    await prisma.round.create({
      data: {
        gameId: game.prismaGameId,
        number: roundNumber,
        finishedAt: new Date(),
        scores: {
          create: game.players.map(p => ({
            discordUserId: p.id,
            username: p.username,
            score: finalScores[p.id],
            doubled: penalty && p.id === game.lastRoundTriggerId,
          })),
        },
      },
    });
  } catch (e) {
    console.error("[prisma] round.create:", e.message);
  }
}

async function dbFinishGame(game, winnerId) {
  if (!game.prismaGameId) return;
  try {
    await prisma.game.update({
      where: { id: game.prismaGameId },
      data: { finishedAt: new Date(), winnerId },
    });
  } catch (e) {
    console.error("[prisma] game.update:", e.message);
  }
}

// =============================================================================
// LOGIQUE DE JEU
// =============================================================================
function startRound(game) {
  const deck = shuffle(createDeck());
  game.deck = deck;
  game.discardPile = [];
  game.drawnCard = null;
  game.drawnFrom = null;
  game.turnPhase = "draw";
  game.lastRoundTriggerId = null;
  game.lastRoundRemaining = [];
  game.phase = "initial_reveal";

  game.players.forEach(p => {
    p.grid = dealGrid(game.deck);
    p.initialReveals = 0;
  });

  game.discardPile.push(game.deck.pop());
  syncDiscardTop(game);
}

function handlePostPlace(io, game, player) {
  const cols = checkColumnsToRemove(player.grid);
  if (cols.length > 0) {
    player.grid = removeColumns(player.grid, cols);
    addLog(game, `${player.username} élimine ${cols.length} colonne(s) identique(s) !`);
  }

  if (allFaceUp(player.grid) && game.phase === "playing") {
    game.phase = "last_round";
    game.lastRoundTriggerId = player.id;
    game.lastRoundRemaining = game.players
      .filter(p => p.id !== player.id)
      .map(p => p.id);
    addLog(game, `${player.username} retourne sa dernière carte ! Dernier tour pour les autres.`);
  }

  afterTurn(io, game).catch(e => console.error("[afterTurn]", e));
}

function getNextPlayerIndex(game) {
  const total = game.players.length;
  for (let i = 1; i <= total; i++) {
    const idx = (game.currentPlayerIndex + i) % total;
    if (game.phase === "last_round") {
      if (game.lastRoundRemaining.includes(game.players[idx].id)) return idx;
    } else {
      return idx;
    }
  }
  return -1;
}

async function afterTurn(io, game) {
  if (game.phase === "last_round") {
    const cur = game.players[game.currentPlayerIndex];
    game.lastRoundRemaining = game.lastRoundRemaining.filter(id => id !== cur.id);
    if (game.lastRoundRemaining.length === 0) {
      await endRound(io, game);
      return;
    }
  }

  const nextIdx = getNextPlayerIndex(game);
  if (nextIdx === -1) {
    await endRound(io, game);
    return;
  }

  game.currentPlayerIndex = nextIdx;
  game.turnPhase = "draw";
  game.drawnCard = null;
  game.drawnFrom = null;

  const next = game.players[game.currentPlayerIndex];
  addLog(game, `Tour de ${next.username}.`);
  broadcastGameState(io, game);

  if (next.socketId && next.isConnected) {
    io.to(next.socketId).emit("your_turn", {
      playerId: next.id,
      actions: ["draw_from_deck", "draw_from_discard"],
    });
  }
}

async function endRound(io, game) {
  // Révéler toutes les cartes restantes
  game.players.forEach(p => {
    p.grid.forEach(row => row.forEach(c => (c.faceUp = true)));
  });

  // Scores bruts
  const rawScores = {};
  game.players.forEach(p => { rawScores[p.id] = roundScore(p.grid); });

  // Pénalité
  const minScore = Math.min(...Object.values(rawScores));
  const triggerRaw = rawScores[game.lastRoundTriggerId];
  const penalty = triggerRaw > minScore;

  const finalScores = { ...rawScores };
  if (penalty) {
    finalScores[game.lastRoundTriggerId] = triggerRaw * 2;
    const triggerName = game.players.find(p => p.id === game.lastRoundTriggerId)?.username;
    addLog(game, `Pénalité : ${triggerName} (${triggerRaw} → ${triggerRaw * 2}) !`);
  }

  // Sauvegarder le round en DB
  await dbSaveRound(game, game.roundNumber, finalScores, penalty);

  // Données pour l'overlay scores côté client (avant maj cumulatif)
  const roundEndData = {
    roundNumber: game.roundNumber,
    penaltyPlayerId: penalty ? game.lastRoundTriggerId : null,
    scores: game.players.map(p => ({
      id: p.id,
      username: p.username,
      rawScore: rawScores[p.id],
      roundScore: finalScores[p.id],
      doubled: penalty && p.id === game.lastRoundTriggerId,
      cumulativeBefore: p.cumulativeScore,
      cumulativeAfter: p.cumulativeScore + finalScores[p.id],
    })),
  };

  // Mettre à jour les scores cumulatifs
  game.players.forEach(p => {
    p.cumulativeScore = (p.cumulativeScore || 0) + finalScores[p.id];
  });

  addLog(game, `Fin de la manche ${game.roundNumber}.`);

  // Fin de partie ?
  if (game.players.some(p => p.cumulativeScore >= 100)) {
    game.phase = "game_over";
    const winner = game.players.reduce((a, b) =>
      a.cumulativeScore <= b.cumulativeScore ? a : b
    );
    await dbFinishGame(game, winner.id);
    broadcastGameState(io, game);
    io.to(game.instanceId).emit("round_end", { ...roundEndData, isGameOver: true });
    io.to(game.instanceId).emit("game_over", {
      scores: game.players.map(p => ({
        id: p.id, username: p.username,
        roundScore: finalScores[p.id],
        cumulativeScore: p.cumulativeScore,
        penalty: penalty && p.id === game.lastRoundTriggerId,
      })),
      winner: { id: winner.id, username: winner.username },
    });
    return;
  }

  // Pause 8 secondes avant la prochaine manche
  game.phase = "scoring";
  broadcastGameState(io, game);
  io.to(game.instanceId).emit("round_end", roundEndData);

  setTimeout(() => {
    if (!games.has(game.instanceId)) return; // partie supprimée
    if (game.phase !== "scoring") return; // état changé (ex: new_game)
    game.roundNumber++;
    const triggerIdx = game.players.findIndex(p => p.id === game.lastRoundTriggerId);
    game.currentPlayerIndex = (triggerIdx + 1) % game.players.length;
    startRound(game);
    broadcastGameState(io, game);
  }, 8000);
}

// =============================================================================
// SERVEUR
// =============================================================================
app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    console.log(`[socket] connecté: ${socket.id}`);

    // -------------------------------------------------------------------------
    socket.on("join_game", ({ discordUserId, username, avatar, instanceId }) => {
      if (!games.has(instanceId)) {
        games.set(instanceId, createGame(instanceId));
      }
      const game = games.get(instanceId);
      const existing = game.players.find(p => p.id === discordUserId);

      if (existing) {
        existing.socketId = socket.id;
        existing.isConnected = true;
        socketToPlayer.set(socket.id, { instanceId, playerId: discordUserId });
        socket.join(instanceId);
        socket.emit("game_state", sanitizeForPlayer(game, discordUserId));
        resendYourTurn(io, game, existing);
        return;
      }

      if (game.phase !== "waiting") {
        socket.emit("error", { message: "La partie a déjà commencé." });
        return;
      }
      if (game.players.length >= 11) {
        socket.emit("error", { message: "Partie pleine (max 11 joueurs)." });
        return;
      }

      game.players.push({
        id: discordUserId, username, avatar,
        socketId: socket.id, grid: [],
        cumulativeScore: 0, initialReveals: 0, isConnected: true,
      });
      socketToPlayer.set(socket.id, { instanceId, playerId: discordUserId });
      socket.join(instanceId);
      addLog(game, `${username} a rejoint la partie.`);
      broadcastGameState(io, game);
    });

    // -------------------------------------------------------------------------
    socket.on("start_game", async () => {
      const info = socketToPlayer.get(socket.id);
      if (!info) return;
      const game = games.get(info.instanceId);
      if (!game || game.phase !== "waiting") return;

      if (game.players.length < 2) {
        socket.emit("error", { message: "Il faut au moins 2 joueurs." });
        return;
      }
      if (game.players[0].id !== info.playerId) {
        socket.emit("error", { message: "Seul l'hôte peut démarrer la partie." });
        return;
      }

      game.prismaGameId = await dbCreateGame(info.instanceId);
      startRound(game);
      addLog(game, "La partie commence ! Retournez 2 cartes chacun.");
      broadcastGameState(io, game);
    });

    // -------------------------------------------------------------------------
    socket.on("new_game", () => {
      const info = socketToPlayer.get(socket.id);
      if (!info) return;
      const game = games.get(info.instanceId);
      if (!game || game.phase !== "game_over") return;
      if (game.players[0].id !== info.playerId) {
        socket.emit("error", { message: "Seul l'hôte peut relancer une partie." });
        return;
      }

      game.phase = "waiting";
      game.roundNumber = 1;
      game.prismaGameId = null;
      game.log = [];
      game.players.forEach(p => {
        p.grid = [];
        p.cumulativeScore = 0;
        p.initialReveals = 0;
      });
      addLog(game, "Nouvelle partie — en attente du démarrage.");
      broadcastGameState(io, game);
    });

    // -------------------------------------------------------------------------
    socket.on("reveal_card", ({ row, col }) => {
      const info = socketToPlayer.get(socket.id);
      if (!info) return;
      const game = games.get(info.instanceId);
      if (!game) return;
      const player = game.players.find(p => p.id === info.playerId);
      if (!player || !player.grid[row]?.[col]) return;

      const card = player.grid[row][col];
      if (card.faceUp) { socket.emit("error", { message: "Carte déjà visible." }); return; }

      if (game.phase === "initial_reveal") {
        if (player.initialReveals >= 2) {
          socket.emit("error", { message: "Vous avez déjà retourné 2 cartes." });
          return;
        }
        card.faceUp = true;
        player.initialReveals++;

        if (game.players.every(p => p.initialReveals >= 2)) {
          game.phase = "playing";
          const startPlayer = game.players.reduce((a, b) =>
            visibleScore(a.grid) >= visibleScore(b.grid) ? a : b
          );
          game.currentPlayerIndex = game.players.indexOf(startPlayer);
          game.turnPhase = "draw";
          addLog(game, `${startPlayer.username} commence (score visible le plus élevé).`);
          broadcastGameState(io, game);
          if (startPlayer.socketId && startPlayer.isConnected) {
            io.to(startPlayer.socketId).emit("your_turn", {
              playerId: startPlayer.id,
              actions: ["draw_from_deck", "draw_from_discard"],
            });
          }
        } else {
          broadcastGameState(io, game);
        }
        return;
      }

      const isCurrentPlayer = game.players[game.currentPlayerIndex].id === info.playerId;
      const canReveal =
        (game.phase === "playing" || game.phase === "last_round") &&
        isCurrentPlayer && game.turnPhase === "act" && game.drawnCard === null;

      if (!canReveal) { socket.emit("error", { message: "Action non autorisée." }); return; }

      card.faceUp = true;
      addLog(game, `${player.username} retourne une carte.`);
      handlePostPlace(io, game, player);
    });

    // -------------------------------------------------------------------------
    socket.on("draw_from_deck", () => {
      const info = socketToPlayer.get(socket.id);
      if (!info) return;
      const game = games.get(info.instanceId);
      if (!game) return;

      if (game.phase !== "playing" && game.phase !== "last_round") return;
      if (game.players[game.currentPlayerIndex].id !== info.playerId) {
        socket.emit("error", { message: "Ce n'est pas votre tour." }); return;
      }
      if (game.turnPhase !== "draw") {
        socket.emit("error", { message: "Vous avez déjà pioché." }); return;
      }

      ensureDeck(game);
      const card = game.deck.pop();
      game.drawnCard = card;
      game.drawnFrom = "deck";
      game.turnPhase = "act";

      socket.emit("card_drawn", { card });
      socket.emit("your_turn", {
        playerId: info.playerId,
        actions: ["place_card", "discard_drawn_card"],
      });
      broadcastGameState(io, game);
    });

    // -------------------------------------------------------------------------
    socket.on("draw_from_discard", () => {
      const info = socketToPlayer.get(socket.id);
      if (!info) return;
      const game = games.get(info.instanceId);
      if (!game) return;

      if (game.phase !== "playing" && game.phase !== "last_round") return;
      if (game.players[game.currentPlayerIndex].id !== info.playerId) {
        socket.emit("error", { message: "Ce n'est pas votre tour." }); return;
      }
      if (game.turnPhase !== "draw") {
        socket.emit("error", { message: "Vous avez déjà pioché." }); return;
      }
      if (game.discardPile.length === 0) {
        socket.emit("error", { message: "La défausse est vide." }); return;
      }

      const card = game.discardPile.pop();
      syncDiscardTop(game);
      game.drawnCard = card;
      game.drawnFrom = "discard";
      game.turnPhase = "act";

      socket.emit("card_drawn", { card });
      socket.emit("your_turn", { playerId: info.playerId, actions: ["place_card"] });
      broadcastGameState(io, game);
    });

    // -------------------------------------------------------------------------
    socket.on("place_card", ({ row, col }) => {
      const info = socketToPlayer.get(socket.id);
      if (!info) return;
      const game = games.get(info.instanceId);
      if (!game) return;
      const player = game.players.find(p => p.id === info.playerId);
      if (!player) return;

      const valid =
        (game.phase === "playing" || game.phase === "last_round") &&
        game.players[game.currentPlayerIndex].id === info.playerId &&
        game.turnPhase === "act" && game.drawnCard !== null &&
        player.grid[row]?.[col] !== undefined;

      if (!valid) { socket.emit("error", { message: "Action non autorisée." }); return; }

      const oldCard = player.grid[row][col];
      game.discardPile.push(oldCard.value);
      syncDiscardTop(game);
      player.grid[row][col] = { value: game.drawnCard, faceUp: true };
      game.drawnCard = null;

      addLog(game, `${player.username} place une carte.`);
      handlePostPlace(io, game, player);
    });

    // -------------------------------------------------------------------------
    socket.on("discard_drawn_card", () => {
      const info = socketToPlayer.get(socket.id);
      if (!info) return;
      const game = games.get(info.instanceId);
      if (!game) return;

      const valid =
        (game.phase === "playing" || game.phase === "last_round") &&
        game.players[game.currentPlayerIndex].id === info.playerId &&
        game.turnPhase === "act" && game.drawnCard !== null &&
        game.drawnFrom === "deck";

      if (!valid) { socket.emit("error", { message: "Action non autorisée." }); return; }

      game.discardPile.push(game.drawnCard);
      syncDiscardTop(game);
      game.drawnCard = null;
      // turnPhase reste "act", drawnCard null → reveal_card attendu

      socket.emit("your_turn", {
        playerId: info.playerId,
        actions: ["reveal_card"],
      });
      broadcastGameState(io, game);
    });

    // -------------------------------------------------------------------------
    socket.on("disconnect", () => {
      const info = socketToPlayer.get(socket.id);
      if (info) {
        const game = games.get(info.instanceId);
        if (game) {
          const player = game.players.find(p => p.id === info.playerId);
          if (player) {
            player.isConnected = false;
            addLog(game, `${player.username} s'est déconnecté.`);
            broadcastGameState(io, game);
          }
        }
        socketToPlayer.delete(socket.id);
      }
      console.log(`[socket] déconnecté: ${socket.id}`);
    });
  });

  function tryListen(port) {
    httpServer.listen(port)
      .on("listening", () => {
        console.log(`> Skyjo prêt → http://localhost:${port}`);
        if (!process.env.DISCORD_CLIENT_ID) {
          console.warn("> DISCORD_CLIENT_ID manquant — mode dev actif (login par pseudo)");
        }
      })
      .on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.warn(`> Port ${port} occupé, essai sur ${port + 1}…`);
          httpServer.close();
          tryListen(port + 1);
        } else {
          throw err;
        }
      });
  }

  tryListen(PORT);
});
