"use client";

import { useEffect, useState } from "react";

export default function ScoreOverlay({ data, isGameOver = false }) {
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    if (isGameOver || !data) return;
    setCountdown(8);
    const id = setInterval(() => {
      setCountdown(c => (c <= 1 ? (clearInterval(id), 0) : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [data?.roundNumber, isGameOver]);

  if (!data) return null;

  const sorted = [...data.scores].sort((a, b) => a.cumulativeAfter - b.cumulativeAfter);

  return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <h2 style={s.title}>
          {isGameOver ? "Dernière manche" : `Fin de la manche ${data.roundNumber}`}
        </h2>

        {data.penaltyPlayerId && (
          <div style={s.penalty}>
            ⚠ {data.scores.find(p => p.id === data.penaltyPlayerId)?.username} ne fait pas le
            meilleur score — pénalité ×2 !
          </div>
        )}

        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Joueur</th>
              <th style={{ ...s.th, textAlign: "center" }}>Manche</th>
              <th style={{ ...s.th, textAlign: "center" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id}>
                <td style={s.td}>
                  {i === 0 && "🏅 "}
                  {p.username}
                  {p.doubled && <span style={{ color: "#f87171", marginLeft: 4 }}>×2</span>}
                </td>
                <td style={{ ...s.td, textAlign: "center" }}>
                  {p.doubled ? (
                    <span>
                      <s style={{ opacity: 0.4, marginRight: 4 }}>{p.rawScore}</s>
                      <span style={{ color: "#f87171", fontWeight: "bold" }}>{p.roundScore}</span>
                    </span>
                  ) : (
                    <span style={{ color: p.roundScore < 0 ? "#4ade80" : p.roundScore > 8 ? "#fbbf24" : "#e2e8f0" }}>
                      {p.roundScore}
                    </span>
                  )}
                </td>
                <td style={{ ...s.td, textAlign: "center", fontWeight: "bold" }}>
                  <span style={{ opacity: 0.45, marginRight: 4 }}>{p.cumulativeBefore}</span>
                  →{" "}
                  <span style={{ color: p.cumulativeAfter >= 80 ? "#f87171" : "#e2e8f0" }}>
                    {p.cumulativeAfter}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isGameOver && (
          <div style={s.countdown}>
            <div style={{ ...s.bar, width: `${(countdown / 8) * 100}%` }} />
            <span>Prochaine manche dans {countdown}s…</span>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.72)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100, backdropFilter: "blur(6px)",
  },
  panel: {
    background: "#161628", borderRadius: 16,
    padding: "28px 36px", maxWidth: 440, width: "92%",
    border: "1px solid #2a2a4a", textAlign: "center",
  },
  title: { fontSize: 20, color: "#ffd700", marginBottom: 12, fontWeight: "800" },
  penalty: {
    background: "#7f1d1d", color: "#fca5a5",
    borderRadius: 8, padding: "8px 14px", fontSize: 13, marginBottom: 14,
  },
  table: { width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 14 },
  th: {
    padding: "8px 10px", background: "#1e293b", color: "#94a3b8",
    fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left",
  },
  td: {
    padding: "10px 10px", borderBottom: "1px solid #1e293b",
    color: "#e2e8f0", textAlign: "left",
  },
  countdown: {
    position: "relative", background: "#1e293b",
    borderRadius: 8, padding: "10px 14px", fontSize: 13,
    color: "#6b7280", overflow: "hidden",
  },
  bar: {
    position: "absolute", top: 0, left: 0, bottom: 0,
    background: "rgba(99,102,241,0.25)",
    transition: "width 1s linear",
    borderRadius: 8,
  },
};
