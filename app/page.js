"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}


export default function Home() {
  const router = useRouter();
  const socketRef = useRef(null);

  const [view, setView] = useState("landing");
  const [username, setUsername] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [gameState, setGameState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [isHostFlag, setIsHostFlag] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => socketRef.current?.disconnect();
  }, []);

  const connectSocket = useCallback(
    (userData, code, hosting, playersMax) => {
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
      const socket = socketUrl ? io(socketUrl) : io();
      socketRef.current = socket;
      setMyId(userData.discordUserId);
      setRoomCode(code);
      setIsHostFlag(hosting);
      setView("lobby");
      setError(null);

      socket.on("game_state", (state) => {
        setGameState(state);
        if (state.phase !== "waiting") {
          sessionStorage.setItem("skyjo_user", JSON.stringify(userData));
          router.push("/game");
        }
      });

      socket.on("error", (err) => setError(err.message));

      socket.emit("join_game", {
        ...userData,
        roomCode: code,
        ...(hosting && { maxPlayers: playersMax }),
      });
    },
    [router]
  );

  const buildUserData = () => ({
    discordUserId: "user_" + Math.random().toString(36).slice(2, 8),
    username: username.trim(),
    avatar: null,
    instanceId: "web_instance",
  });

  const handleCreate = () => {
    if (!username.trim()) return;
    connectSocket(buildUserData(), generateRoomCode(), true, maxPlayers);
  };

  const handleJoin = () => {
    if (!username.trim() || joinCode.trim().length !== 5) return;
    connectSocket(buildUserData(), joinCode.trim().toUpperCase(), false, null);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const players = gameState?.players ?? [];
  const isHost = isHostFlag || players[0]?.id === myId;
  const effectiveMax = gameState?.maxPlayers ?? maxPlayers;
  const canStart = players.length >= 2;
  const missingForMax = effectiveMax - players.length;

  // ── Landing ─────────────────────────────────────────────────────────────
  if (view === "landing") {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.title}>SKYJO</h1>
          <p style={s.subtitle}>Jeu de cartes multijoueur</p>

          {error && <div style={s.errorBox}>{error}</div>}

          <div style={s.section}>
            <label style={s.label}>Votre pseudo</label>
            <input
              style={s.input}
              placeholder="Entrez votre pseudo..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
              autoFocus
            />
          </div>

          <div style={s.section}>
            <label style={s.label}>Nombre de joueurs</label>
            <select
              style={s.select}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            >
              {Array.from({ length: 10 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n} joueurs
                </option>
              ))}
            </select>
            <button
              style={username.trim() ? s.btnPrimary : s.btnDisabled}
              onClick={handleCreate}
              disabled={!username.trim()}
            >
              Créer une partie
            </button>
          </div>

          <div style={s.divider}>
            <span style={s.dividerLine} />
            <span style={s.dividerText}>ou</span>
            <span style={s.dividerLine} />
          </div>

          <div style={s.section}>
            <label style={s.label}>Code de room</label>
            <input
              style={s.input}
              placeholder="Ex : XK92F"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 5))}
              maxLength={5}
            />
            <button
              style={
                username.trim() && joinCode.trim().length === 5
                  ? s.btnSecondary
                  : s.btnDisabled
              }
              onClick={handleJoin}
              disabled={!username.trim() || joinCode.trim().length !== 5}
            >
              Rejoindre une partie
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Lobby ────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>SKYJO</h1>

        <div style={s.roomCodeBox} onClick={handleCopyCode} title="Cliquer pour copier">
          <span style={s.roomCodeLabel}>Code de la salle</span>
          <span style={s.roomCode}>{roomCode}</span>
          <span style={s.roomCodeHint}>{copied ? "Copié !" : "Cliquer pour copier"}</span>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        <div style={s.playerList}>
          <div style={s.listHeader}>
            Joueurs — {players.length} / {effectiveMax}
          </div>
          {players.length === 0 ? (
            <div style={s.playerRow}>
              <span style={{ color: "#2e2e50" }}>Connexion en cours…</span>
            </div>
          ) : (
            players.map((p, i) => (
              <div key={p.id} style={s.playerRow}>
                <span style={s.playerIcon}>{i === 0 ? "👑" : "·"}</span>
                <span style={p.id === myId ? s.playerNameSelf : s.playerName}>
                  {p.username}
                </span>
                {p.id === myId && <span style={s.youBadge}>vous</span>}
                {!p.isConnected && (
                  <span style={s.offlineBadge}>hors-ligne</span>
                )}
              </div>
            ))
          )}
        </div>

        {isHost ? (
          <>
            <button
              style={canStart ? s.btnPrimary : s.btnDisabled}
              onClick={() => socketRef.current?.emit("start_game")}
              disabled={!canStart}
            >
              Lancer la partie
            </button>
            {!canStart && (
              <p style={s.hint}>En attente d'au moins 2 joueurs</p>
            )}
            {canStart && missingForMax > 0 && (
              <p style={s.hint}>
                {missingForMax} joueur{missingForMax > 1 ? "s" : ""} de plus possible{missingForMax > 1 ? "s" : ""}
              </p>
            )}
          </>
        ) : (
          <p style={s.waiting}>En attente que l'hôte lance la partie…</p>
        )}
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const teal = "#00D4D4";
const bg = "#0a0a14";
const cardBg = "#12121f";
const border = "#1e1e35";
const text = "#e0e0e0";
const muted = "#6b7280";

const s = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: bg,
    padding: 16,
  },
  card: {
    background: cardBg,
    borderRadius: 18,
    padding: "36px 40px",
    maxWidth: 420,
    width: "100%",
    textAlign: "center",
    border: `1px solid ${border}`,
    boxShadow: "0 0 40px rgba(0,212,212,0.06)",
  },
  title: {
    fontSize: 46,
    fontWeight: "900",
    color: teal,
    letterSpacing: 6,
    textShadow: "0 0 24px rgba(0,212,212,0.35)",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: muted,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 28,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 10,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 2,
    textAlign: "left",
  },
  input: {
    background: "#0d0d1c",
    border: `1px solid ${border}`,
    color: text,
    borderRadius: 8,
    padding: "11px 14px",
    fontSize: 15,
    width: "100%",
  },
  select: {
    background: "#0d0d1c",
    border: `1px solid ${border}`,
    color: text,
    borderRadius: 8,
    padding: "11px 14px",
    fontSize: 15,
    width: "100%",
    cursor: "pointer",
  },
  btnPrimary: {
    background: teal,
    color: "#000",
    border: "none",
    borderRadius: 8,
    padding: "13px 28px",
    fontSize: 15,
    fontWeight: "700",
    width: "100%",
    letterSpacing: 0.5,
    transition: "opacity 0.15s",
  },
  btnSecondary: {
    background: "transparent",
    color: teal,
    border: `1.5px solid ${teal}`,
    borderRadius: 8,
    padding: "12px 28px",
    fontSize: 15,
    fontWeight: "700",
    width: "100%",
    letterSpacing: 0.5,
    transition: "opacity 0.15s",
  },
  btnDisabled: {
    background: "#111120",
    color: "#2e2e50",
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: "13px 28px",
    fontSize: 15,
    fontWeight: "700",
    width: "100%",
    letterSpacing: 0.5,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "4px 0 16px",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: border,
    display: "block",
  },
  dividerText: {
    color: muted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  errorBox: {
    background: "#2a0a0a",
    color: "#ff6b6b",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
    fontSize: 13,
    border: "1px solid #4a1515",
  },
  roomCodeBox: {
    background: bg,
    border: `1px solid ${teal}`,
    borderRadius: 10,
    padding: "14px 20px",
    marginBottom: 24,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    boxShadow: "0 0 20px rgba(0,212,212,0.08)",
  },
  roomCodeLabel: {
    fontSize: 9,
    color: teal,
    textTransform: "uppercase",
    letterSpacing: 2.5,
    opacity: 0.7,
  },
  roomCode: {
    fontSize: 34,
    fontWeight: "900",
    color: teal,
    letterSpacing: 10,
    textShadow: "0 0 16px rgba(0,212,212,0.5)",
  },
  roomCodeHint: {
    fontSize: 10,
    color: muted,
    letterSpacing: 1,
  },
  playerList: {
    background: bg,
    borderRadius: 10,
    marginBottom: 20,
    overflow: "hidden",
    border: `1px solid ${border}`,
  },
  listHeader: {
    padding: "9px 16px",
    background: "#0f0f1e",
    fontSize: 10,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 2,
    textAlign: "left",
  },
  playerRow: {
    padding: "11px 16px",
    borderBottom: `1px solid ${border}`,
    fontSize: 15,
    color: text,
    display: "flex",
    alignItems: "center",
    gap: 8,
    textAlign: "left",
  },
  playerIcon: {
    fontSize: 13,
    width: 20,
    textAlign: "center",
    flexShrink: 0,
  },
  playerName: {
    flex: 1,
    color: text,
  },
  playerNameSelf: {
    flex: 1,
    color: teal,
    fontWeight: "600",
  },
  youBadge: {
    fontSize: 9,
    color: teal,
    background: "rgba(0,212,212,0.08)",
    border: "1px solid rgba(0,212,212,0.25)",
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  offlineBadge: {
    fontSize: 9,
    color: muted,
    background: "rgba(100,100,100,0.08)",
    border: `1px solid ${border}`,
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: 1,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  waiting: {
    color: muted,
    fontSize: 14,
    marginTop: 4,
  },
  hint: {
    color: "#2e2e50",
    fontSize: 12,
    marginTop: 10,
    letterSpacing: 0.3,
  },
};
