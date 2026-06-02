"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import PlayerGrid from "../components/PlayerGrid";
import GameLog from "../components/GameLog";
import DrawArea from "../components/DrawArea";
import ScoreOverlay from "../components/ScoreOverlay";

export default function GamePage() {
  const router = useRouter();
  const socketRef = useRef(null);
  const [gameState, setGameState] = useState(null);
  const [myActions, setMyActions] = useState([]);
  const [drawnCard, setDrawnCard] = useState(null);
  const [user, setUser] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [roundEnd, setRoundEnd] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("skyjo_user");
    if (!raw) { router.push("/"); return; }
    const userData = JSON.parse(raw);
    setUser(userData);

    const socket = io();
    socketRef.current = socket;

    socket.on("game_state", (state) => {
      setGameState(state);
      // Sortie de la phase scoring → cacher l'overlay
      if (state.phase !== "scoring" && state.phase !== "game_over") {
        setRoundEnd(null);
      }
      if (state.phase === "waiting") {
        router.push("/");
      }
    });

    socket.on("your_turn", ({ playerId, actions }) => {
      if (playerId === userData.discordUserId) {
        setMyActions(actions);
        if (actions.includes("draw_from_deck") || actions.includes("draw_from_discard")) {
          setDrawnCard(null);
        }
      } else {
        setMyActions([]);
      }
    });

    socket.on("card_drawn", ({ card }) => setDrawnCard(card));

    socket.on("round_end", (data) => setRoundEnd(data));

    socket.on("game_over", (data) => {
      setGameOver(data);
      setRoundEnd(null);
    });

    socket.on("error", (err) => {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    });

    socket.emit("join_game", userData);
    return () => socket.disconnect();
  }, []);

  const emit = (event, data) => socketRef.current?.emit(event, data);

  const isMyTurn = () =>
    gameState && user &&
    gameState.players[gameState.currentPlayerIndex]?.id === user.discordUserId;

  const handleCardClick = (playerId, row, col, card) => {
    if (!user || playerId !== user.discordUserId) return;
    if (gameState.phase === "initial_reveal") {
      if (!card.faceUp) emit("reveal_card", { row, col });
      return;
    }
    if (!isMyTurn()) return;
    if (myActions.includes("place_card") && drawnCard !== null) {
      emit("place_card", { row, col });
      setDrawnCard(null);
      setMyActions([]);
    } else if (myActions.includes("reveal_card") && !card.faceUp) {
      emit("reveal_card", { row, col });
      setMyActions([]);
    }
  };

  const myPlayer = gameState?.players?.find(p => p.id === user?.discordUserId);
  const otherPlayers = gameState?.players?.filter(p => p.id !== user?.discordUserId) || [];
  const isHost = gameState?.players?.[0]?.id === user?.discordUserId;

  const statusText = () => {
    if (!gameState) return "";
    const p = gameState.phase;
    if (p === "initial_reveal")
      return `Retournez 2 cartes (${myPlayer?.initialReveals || 0}/2)`;
    if (p === "scoring") return "Fin de manche — scores en cours…";
    if (p === "game_over") return "Partie terminée";
    const cur = gameState.players[gameState.currentPlayerIndex]?.username;
    if (p === "last_round") return `Dernier tour ! (${cur})`;
    return isMyTurn() ? "Votre tour" : `Tour de ${cur}`;
  };

  const actionHint = () => {
    if (!isMyTurn() && gameState?.phase !== "initial_reveal") return null;
    if (gameState?.phase === "initial_reveal")
      return (myPlayer?.initialReveals || 0) < 2 ? "Cliquez 2 cartes à révéler" : "En attente des autres joueurs…";
    if (myActions.includes("draw_from_deck") || myActions.includes("draw_from_discard"))
      return "Piochez une carte (deck ou défausse)";
    if (myActions.includes("place_card") && drawnCard !== null)
      return "Cliquez une carte de votre grille pour la remplacer";
    if (myActions.includes("reveal_card"))
      return "Cliquez une carte face cachée à retourner";
    return null;
  };

  // ── Écran Fin de Partie ────────────────────────────────────────────────────
  if (gameOver) {
    return (
      <div style={s.page}>
        <div style={s.gameOverCard}>
          <h2 style={{ color: "#ffd700", fontSize: 26, marginBottom: 6 }}>Partie terminée !</h2>
          <p style={{ color: "#6b7280", marginBottom: 22 }}>
            Vainqueur : <strong style={{ color: "#4ade80" }}>{gameOver.winner.username}</strong>
          </p>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Joueur</th>
                <th style={{ ...s.th, textAlign: "center" }}>Manche</th>
                <th style={{ ...s.th, textAlign: "center" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {[...gameOver.scores]
                .sort((a, b) => a.cumulativeScore - b.cumulativeScore)
                .map((p, i) => (
                  <tr key={p.id}>
                    <td style={s.td}>
                      {i === 0 ? "🏆 " : ""}{p.username}
                      {p.penalty && <span style={{ color: "#f87171", fontSize: 11 }}> ×2</span>}
                    </td>
                    <td style={{ ...s.td, textAlign: "center" }}>{p.roundScore}</td>
                    <td style={{ ...s.td, textAlign: "center", fontWeight: "bold" }}>
                      {p.cumulativeScore}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {isHost ? (
            <button style={s.btnPrimary} onClick={() => emit("new_game")}>
              Rejouer
            </button>
          ) : (
            <p style={{ color: "#6b7280", fontSize: 13 }}>En attente de l'hôte pour rejouer…</p>
          )}
        </div>
      </div>
    );
  }

  if (!gameState) {
    return <div style={s.page}><p style={{ color: "#6b7280" }}>Connexion…</p></div>;
  }

  // ── Plateau de jeu ─────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {/* Overlay scores entre manches */}
      {roundEnd && <ScoreOverlay data={roundEnd} isGameOver={roundEnd.isGameOver} />}

      {/* Header */}
      <div style={s.header}>
        <span style={s.badge}>Manche {gameState.roundNumber}</span>
        <span style={s.status}>{statusText()}</span>
      </div>

      {/* Erreur */}
      {error && <div style={s.errorBanner}>{error}</div>}

      {/* Hint d'action */}
      {actionHint() && <div style={s.hintBanner}>{actionHint()}</div>}

      {/* Carte piochée + bouton défausse */}
      {drawnCard !== null && isMyTurn() && (
        <div style={s.drawnArea}>
          <span style={s.drawnLabel}>Carte piochée</span>
          <DrawnCardDisplay value={drawnCard} />
          {myActions.includes("discard_drawn_card") && (
            <button style={s.btnDiscard} onClick={() => {
              emit("discard_drawn_card");
              setDrawnCard(null);
            }}>
              Défausser et retourner une carte
            </button>
          )}
        </div>
      )}

      {/* Zone pioche / défausse */}
      {(gameState.phase === "playing" || gameState.phase === "last_round") && (
        <DrawArea
          deckCount={gameState.deckCount}
          topDiscard={gameState.topDiscard}
          myActions={myActions}
          onDrawDeck={() => emit("draw_from_deck")}
          onDrawDiscard={() => emit("draw_from_discard")}
        />
      )}

      {/* Ma grille */}
      {myPlayer && (
        <div style={s.myGrid}>
          <PlayerGrid
            player={myPlayer}
            isCurrentTurn={isMyTurn()}
            isMe
            myActions={myActions}
            drawnCard={drawnCard}
            onCardClick={handleCardClick}
            size="lg"
            phase={gameState.phase}
          />
        </div>
      )}

      {/* Grilles adversaires */}
      {otherPlayers.length > 0 && (
        <div style={s.others}>
          {otherPlayers.map(p => (
            <PlayerGrid
              key={p.id}
              player={p}
              isCurrentTurn={gameState.players[gameState.currentPlayerIndex]?.id === p.id}
              isMe={false}
              myActions={[]}
              drawnCard={null}
              onCardClick={handleCardClick}
              size="sm"
              phase={gameState.phase}
            />
          ))}
        </div>
      )}

      {/* Journal */}
      <div style={{ width: "100%", maxWidth: 480 }}>
        <GameLog log={gameState.log} />
      </div>
    </div>
  );
}

function DrawnCardDisplay({ value }) {
  const COLORS = {
    "-2": { bg: "#3b4fd8", c: "#fff" }, "-1": { bg: "#5b9bd5", c: "#fff" },
    "0": { bg: "#d4d4d4", c: "#333" }, "1": { bg: "#6abf69", c: "#fff" },
    "2": { bg: "#5db55c", c: "#fff" }, "3": { bg: "#50aa4f", c: "#fff" },
    "4": { bg: "#449f43", c: "#fff" }, "5": { bg: "#f0c040", c: "#333" },
    "6": { bg: "#e8a830", c: "#333" }, "7": { bg: "#e09020", c: "#fff" },
    "8": { bg: "#d87810", c: "#fff" }, "9": { bg: "#e05030", c: "#fff" },
    "10": { bg: "#d03020", c: "#fff" }, "11": { bg: "#c02010", c: "#fff" },
    "12": { bg: "#b01000", c: "#fff" },
  };
  const col = COLORS[String(value)] || { bg: "#555", c: "#fff" };
  return (
    <div style={{
      width: 52, height: 72, borderRadius: 8,
      background: col.bg, color: col.c,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 22, fontWeight: "bold",
      border: "2px solid rgba(255,255,255,0.2)",
      boxShadow: "0 0 12px rgba(255,215,0,0.4)",
    }}>
      {value}
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    display: "flex", flexDirection: "column", alignItems: "center",
    background: "#0f0f1a", padding: "10px 14px", gap: 10,
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", maxWidth: 480,
  },
  badge: {
    background: "#1e293b", color: "#94a3b8",
    borderRadius: 6, padding: "4px 10px", fontSize: 11,
    fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1,
  },
  status: { fontSize: 13, color: "#e2e8f0", fontWeight: "500" },
  errorBanner: {
    background: "#7f1d1d", color: "#fca5a5", borderRadius: 8,
    padding: "8px 16px", fontSize: 13, width: "100%", maxWidth: 480, textAlign: "center",
  },
  hintBanner: {
    background: "#1e3a5f", color: "#93c5fd", borderRadius: 8,
    padding: "8px 16px", fontSize: 12, width: "100%", maxWidth: 480,
    textAlign: "center", fontWeight: "500",
  },
  drawnArea: {
    display: "flex", alignItems: "center", gap: 12,
    background: "#1a2035", borderRadius: 10,
    padding: "10px 16px", border: "1px solid #2a3a5e",
  },
  drawnLabel: { fontSize: 11, color: "#6b7280" },
  btnDiscard: {
    background: "#374151", color: "#d1d5db", border: "none",
    borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: "500",
    cursor: "pointer",
  },
  myGrid: {
    background: "#13182a", borderRadius: 12, padding: 16,
    border: "1px solid #1e293b",
  },
  others: {
    display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center",
    background: "#0d1120", borderRadius: 12, padding: 12,
    border: "1px solid #1a2035", width: "100%", maxWidth: 480,
  },
  gameOverCard: {
    background: "#161628", borderRadius: 16, padding: "32px 36px",
    maxWidth: 420, width: "100%", textAlign: "center", border: "1px solid #2a2a4a",
  },
  table: { width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 14 },
  th: {
    padding: "8px 10px", background: "#1e293b", color: "#94a3b8",
    fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left",
  },
  td: { padding: "10px 10px", borderBottom: "1px solid #1e293b", color: "#e2e8f0" },
  btnPrimary: {
    background: "#2563eb", color: "#fff", border: "none",
    borderRadius: 8, padding: "12px 28px", fontSize: 15,
    fontWeight: "bold", cursor: "pointer", width: "100%",
  },
};
