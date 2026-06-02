"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

let discordSdkInstance = null;

async function initDiscord() {
  const { DiscordSDK } = await import("@discord/embedded-app-sdk");
  if (!discordSdkInstance) {
    discordSdkInstance = new DiscordSDK(process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "DEV");
  }
  const sdk = discordSdkInstance;
  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  });

  const res = await fetch("/api/auth/discord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const { access_token } = await res.json();
  await sdk.commands.authenticate({ access_token });

  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const me = await meRes.json();

  return {
    discordUserId: me.id,
    username: me.global_name || me.username,
    avatar: me.avatar,
    instanceId: sdk.instanceId,
  };
}

export default function Lobby() {
  const router = useRouter();
  const socketRef = useRef(null);
  const [gameState, setGameState] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [devName, setDevName] = useState("");
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    let socket;

    async function init() {
      let userData;
      try {
        // Timeout 2s : sdk.ready() hang indéfiniment hors Discord
        userData = await Promise.race([
          initDiscord(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("discord_timeout")), 2000)
          ),
        ]);
      } catch (e) {
        console.warn("Discord SDK indisponible, mode dev actif.", e.message);
        setDevMode(true);
        return;
      }
      connectSocket(userData);
    }

    function connectSocket(userData) {
      setUser(userData);
      sessionStorage.setItem("skyjo_user", JSON.stringify(userData));

      socket = io();
      socketRef.current = socket;

      socket.on("game_state", (state) => {
        setGameState(state);
        if (state.phase !== "waiting") {
          router.push("/game");
        }
      });
      socket.on("error", (err) => setError(err.message));
      socket.emit("join_game", userData);
    }

    init();
    return () => socket?.disconnect();
  }, []);

  const joinDev = () => {
    if (!devName.trim()) return;
    const userData = {
      discordUserId: "dev_" + Math.random().toString(36).slice(2, 7),
      username: devName.trim(),
      avatar: null,
      instanceId: "dev_instance",
    };

    const socket = io();
    socketRef.current = socket;
    setUser(userData);
    sessionStorage.setItem("skyjo_user", JSON.stringify(userData));

    socket.on("game_state", (state) => {
      setGameState(state);
      if (state.phase !== "waiting") {
        router.push("/game");
      }
    });
    socket.on("error", (err) => setError(err.message));
    socket.emit("join_game", userData);
    setDevMode(false);
  };

  const startGame = () => socketRef.current?.emit("start_game");
  const isHost = gameState?.players?.[0]?.id === user?.discordUserId;

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Skyjo</h1>
        <p style={s.subtitle}>Discord Activity</p>

        {error && <div style={s.errorBox}>{error}</div>}

        {devMode ? (
          <div style={s.devBox}>
            <p style={s.devLabel}>Mode développement</p>
            <input
              style={s.input}
              placeholder="Votre pseudo..."
              value={devName}
              onChange={e => setDevName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && joinDev()}
            />
            <button style={s.btn} onClick={joinDev} disabled={!devName.trim()}>
              Rejoindre
            </button>
          </div>
        ) : !gameState ? (
          <p style={s.loading}>Connexion...</p>
        ) : (
          <>
            <div style={s.playerList}>
              <div style={s.listHeader}>Joueurs ({gameState.players.length}/11)</div>
              {gameState.players.map((p, i) => (
                <div key={p.id} style={s.playerRow}>
                  <span style={{ marginRight: 6, opacity: 0.7 }}>{i === 0 ? "👑" : "·"}</span>
                  <span>{p.username}</span>
                  {!p.isConnected && <span style={{ color: "#555", marginLeft: 6, fontSize: 11 }}>(offline)</span>}
                </div>
              ))}
            </div>

            {isHost ? (
              <button
                style={{ ...s.btn, ...(gameState.players.length < 2 ? {} : s.btnActive) }}
                onClick={startGame}
                disabled={gameState.players.length < 2}
              >
                Démarrer la partie
              </button>
            ) : (
              <p style={s.waiting}>En attente que l'hôte démarre...</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f1a",
    padding: 16,
  },
  card: {
    background: "#161628",
    borderRadius: 16,
    padding: "32px 40px",
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
    border: "1px solid #2a2a4a",
  },
  title: { fontSize: 42, fontWeight: "900", color: "#ffd700", letterSpacing: 2 },
  subtitle: { fontSize: 13, color: "#555", marginBottom: 28 },
  loading: { color: "#4b5563", fontSize: 15 },
  waiting: { color: "#6b7280", fontSize: 14, marginTop: 12 },
  errorBox: {
    background: "#7f1d1d", color: "#fca5a5",
    borderRadius: 8, padding: "8px 14px",
    marginBottom: 16, fontSize: 13,
  },
  devBox: { display: "flex", flexDirection: "column", gap: 10, alignItems: "center" },
  devLabel: { color: "#6b7280", fontSize: 12, marginBottom: 4 },
  input: {
    background: "#1f2937", border: "1px solid #374151", color: "#e5e7eb",
    borderRadius: 8, padding: "10px 14px", fontSize: 15, width: "100%",
    outline: "none",
  },
  playerList: {
    background: "#0f172a",
    borderRadius: 10,
    marginBottom: 20,
    overflow: "hidden",
    border: "1px solid #1e293b",
  },
  listHeader: {
    padding: "10px 16px",
    background: "#1e293b",
    fontSize: 12,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  playerRow: {
    padding: "10px 16px",
    borderBottom: "1px solid #1e293b",
    fontSize: 15,
    color: "#e2e8f0",
    display: "flex",
    alignItems: "center",
    textAlign: "left",
  },
  btn: {
    background: "#374151",
    color: "#9ca3af",
    border: "none",
    borderRadius: 8,
    padding: "12px 28px",
    fontSize: 16,
    fontWeight: "bold",
    transition: "background 0.2s",
    width: "100%",
  },
  btnActive: { background: "#2563eb", color: "#fff" },
};
