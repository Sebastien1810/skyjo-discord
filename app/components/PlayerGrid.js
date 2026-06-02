"use client";

import Card from "./Card";

export default function PlayerGrid({
  player,
  isCurrentTurn,
  isMe,
  myActions = [],
  drawnCard,
  onCardClick,
  size = "md",
  phase,
}) {
  if (!player?.grid) return null;

  const canClickCard = (card, row, col) => {
    if (!isMe) return false;
    if (phase === "initial_reveal") {
      return !card.faceUp && (player.initialReveals || 0) < 2;
    }
    if (!isCurrentTurn) return false;
    if (myActions.includes("place_card") && drawnCard !== null) return true;
    if (myActions.includes("reveal_card") && !card.faceUp) return true;
    return false;
  };

  const shouldHighlight = (card, row, col) => {
    if (!isMe) return false;
    if (phase === "initial_reveal") return !card.faceUp && (player.initialReveals || 0) < 2;
    if (!isCurrentTurn) return false;
    if (myActions.includes("place_card") && drawnCard !== null) return true;
    if (myActions.includes("reveal_card") && !card.faceUp) return true;
    return false;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{
        fontSize: size === "sm" ? 11 : 13,
        fontWeight: isCurrentTurn ? "bold" : "normal",
        color: isCurrentTurn ? "#ffd700" : isMe ? "#7eb8ff" : "#aaa",
        marginBottom: 2,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        {isCurrentTurn && <span>▶</span>}
        {player.username}
        {!player.isConnected && <span style={{ color: "#666", fontSize: 10 }}>(hors ligne)</span>}
        <span style={{ color: "#888", fontSize: size === "sm" ? 10 : 12 }}>
          {player.cumulativeScore} pts
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: size === "sm" ? 3 : 4 }}>
        {player.grid.map((row, r) => (
          <div key={r} style={{ display: "flex", gap: size === "sm" ? 3 : 4 }}>
            {row.map((card, c) => (
              <Card
                key={c}
                value={card.value}
                faceUp={card.faceUp}
                size={size}
                clickable={canClickCard(card, r, c)}
                highlight={shouldHighlight(card, r, c)}
                onClick={() => onCardClick?.(player.id, r, c, card)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
