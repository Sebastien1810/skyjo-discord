"use client";

import Card from "./Card";

export default function DrawArea({ deckCount, topDiscard, myActions, onDrawDeck, onDrawDiscard }) {
  const canDrawDeck = myActions.includes("draw_from_deck");
  const canDrawDiscard = myActions.includes("draw_from_discard") && topDiscard !== null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 32, padding: "8px 0",
    }}>
      {/* Pioche */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div
          style={{ position: "relative", width: 64, height: 88, cursor: canDrawDeck ? "pointer" : "default" }}
          onClick={canDrawDeck ? onDrawDeck : undefined}
        >
          {/* Cartes décalées (effet pile) */}
          <div style={{ position: "absolute", top: -4, left: 4, zIndex: 1, opacity: 0.5 }}>
            <Card faceUp={false} size="lg" />
          </div>
          <div style={{ position: "absolute", top: -2, left: 2, zIndex: 2, opacity: 0.75 }}>
            <Card faceUp={false} size="lg" />
          </div>
          {/* Carte du dessus */}
          <div style={{ position: "absolute", top: 0, left: 0, zIndex: 3 }}>
            <Card
              faceUp={false}
              size="lg"
              clickable={canDrawDeck}
              highlight={canDrawDeck}
              onClick={canDrawDeck ? onDrawDeck : undefined}
            />
          </div>
        </div>
        <span style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{deckCount} cartes</span>
      </div>

      {/* Défausse */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {topDiscard !== null ? (
          <Card
            value={topDiscard}
            faceUp={true}
            size="lg"
            clickable={canDrawDiscard}
            highlight={canDrawDiscard}
            onClick={canDrawDiscard ? onDrawDiscard : undefined}
          />
        ) : (
          <div style={{
            width: 64, height: 88, borderRadius: 8,
            border: "2px dashed #374151",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#374151", fontSize: 12,
          }}>
            vide
          </div>
        )}
        <span style={{ fontSize: 11, color: "#6b7280" }}>défausse</span>
      </div>
    </div>
  );
}
