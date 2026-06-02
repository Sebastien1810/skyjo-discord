"use client";

const CARD_COLORS = {
  "-2": { bg: "#3b4fd8", text: "#fff" },
  "-1": { bg: "#5b9bd5", text: "#fff" },
  "0":  { bg: "#d4d4d4", text: "#333" },
  "1":  { bg: "#6abf69", text: "#fff" },
  "2":  { bg: "#5db55c", text: "#fff" },
  "3":  { bg: "#50aa4f", text: "#fff" },
  "4":  { bg: "#449f43", text: "#fff" },
  "5":  { bg: "#f0c040", text: "#333" },
  "6":  { bg: "#e8a830", text: "#333" },
  "7":  { bg: "#e09020", text: "#fff" },
  "8":  { bg: "#d87810", text: "#fff" },
  "9":  { bg: "#e05030", text: "#fff" },
  "10": { bg: "#d03020", text: "#fff" },
  "11": { bg: "#c02010", text: "#fff" },
  "12": { bg: "#b01000", text: "#fff" },
};

export default function Card({ value, faceUp, size = "md", clickable = false, onClick, highlight = false }) {
  const sizes = {
    sm: { width: 36, height: 50, fontSize: 14, radius: 4 },
    md: { width: 52, height: 72, fontSize: 20, radius: 6 },
    lg: { width: 64, height: 88, fontSize: 24, radius: 8 },
  };
  const s = sizes[size] || sizes.md;
  const colors = faceUp && value !== null ? (CARD_COLORS[String(value)] || { bg: "#555", text: "#fff" }) : null;

  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        width: s.width,
        height: s.height,
        borderRadius: s.radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: s.fontSize,
        fontWeight: "bold",
        userSelect: "none",
        transition: "transform 0.15s, box-shadow 0.15s",
        cursor: clickable ? "pointer" : "default",
        background: faceUp && colors ? colors.bg : "linear-gradient(135deg, #1e2a4a 0%, #2a3a5e 100%)",
        color: faceUp && colors ? colors.text : "#8899aa",
        border: highlight
          ? "2px solid #ffd700"
          : faceUp
            ? "2px solid rgba(255,255,255,0.15)"
            : "2px solid #3a4a6a",
        boxShadow: highlight
          ? "0 0 10px rgba(255,215,0,0.6)"
          : clickable
            ? "0 2px 8px rgba(0,0,0,0.4)"
            : "0 1px 4px rgba(0,0,0,0.3)",
        transform: clickable && highlight ? "translateY(-4px)" : "none",
        flexShrink: 0,
      }}
    >
      {faceUp && value !== null ? value : (
        <span style={{ fontSize: s.fontSize * 0.55, opacity: 0.4 }}>■■</span>
      )}
    </div>
  );
}
