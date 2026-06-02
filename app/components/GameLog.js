"use client";

export default function GameLog({ log = [] }) {
  return (
    <div style={{
      background: "#111827",
      borderRadius: 8,
      padding: "10px 14px",
      maxHeight: 160,
      overflowY: "auto",
      fontSize: 12,
      color: "#9ca3af",
      border: "1px solid #1f2937",
    }}>
      {log.length === 0 ? (
        <span style={{ opacity: 0.4 }}>Journal des actions...</span>
      ) : (
        log.map((entry, i) => (
          <div key={i} style={{
            padding: "3px 0",
            borderBottom: i < log.length - 1 ? "1px solid #1f2937" : "none",
            opacity: Math.max(0.4, 1 - i * 0.07),
          }}>
            {entry.message}
          </div>
        ))
      )}
    </div>
  );
}
