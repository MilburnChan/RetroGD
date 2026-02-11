"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const sanitizeRoomCode = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const formatRoomCode = (value: string): string => {
  if (value.length <= 4) return value;
  return `${value.slice(0, 4)}-${value.slice(4)}`;
};

export default function HomePage() {
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const [nickname, setNickname] = useState("玩家");
  const [roomCodeRaw, setRoomCodeRaw] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const roomCodeDisplay = useMemo(() => formatRoomCode(roomCodeRaw), [roomCodeRaw]);

  useEffect(() => {
    nicknameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const createRoom = async () => {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname })
      });
      const data = (await res.json()) as { roomId?: string; error?: { message: string } };

      if (!res.ok || !data.roomId) {
        setMessage(data.error?.message ?? "建房失败");
        return;
      }

      window.location.href = `/rooms/${data.roomId}`;
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!roomCodeRaw) {
      setMessage("请输入房间码");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: roomCodeRaw, nickname })
      });

      const data = (await res.json()) as {
        roomSnapshot?: { roomId: string };
        error?: { message: string };
      };

      if (!res.ok || !data.roomSnapshot?.roomId) {
        setMessage(data.error?.message ?? "加入房间失败");
        return;
      }

      window.location.href = `/rooms/${data.roomSnapshot.roomId}`;
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lobby-shell">
      <header className="lobby-hero pixel-panel">
        <p className="lobby-kicker">VERDIGRIS ARENA</p>
        <h1>掼蛋 · 联机对战 + AI 复盘</h1>
        <p>
          四人二队，牌势实时推进。每盘结束自动生成中文战术复盘，帮你看懂胜负转折。
        </p>
      </header>

      <section className="lobby-grid">
        <article className="lobby-card lobby-card-primary pixel-panel">
          <p className="lobby-card-title">创建房间</p>
          <p className="lobby-card-desc">快速开局，空位自动补 AI。</p>

          <div className="lobby-form">
            <label className="lobby-label" htmlFor="nickname-input">
              昵称
            </label>
            <input
              id="nickname-input"
              ref={nicknameRef}
              className="pixel-input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="你的昵称"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void createRoom();
                }
              }}
            />
            <button className="pixel-btn" disabled={loading} onClick={() => void createRoom()}>
              {loading ? "处理中..." : "创建房间"}
            </button>
          </div>
        </article>

        <article className="lobby-card lobby-card-secondary pixel-panel">
          <p className="lobby-card-title">加入房间</p>
          <p className="lobby-card-desc">输入 6 位房间码，立即入座。</p>

          <div className="lobby-form">
            <label className="lobby-label" htmlFor="room-code-input">
              房间码
            </label>
            <input
              id="room-code-input"
              className="pixel-input room-code-input"
              value={roomCodeDisplay}
              onChange={(e) => setRoomCodeRaw(sanitizeRoomCode(e.target.value))}
              placeholder="ABCD-EF"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void joinRoom();
                }
              }}
            />
            <button className="pixel-btn secondary" disabled={loading} onClick={() => void joinRoom()}>
              {loading ? "处理中..." : "加入对局"}
            </button>
          </div>
        </article>
      </section>

      {message ? (
        <section className="status-strip pixel-panel" role="status" aria-live="polite">
          <p>{message}</p>
          <button type="button" className="pixel-btn secondary" onClick={() => setMessage("")}>
            关闭
          </button>
        </section>
      ) : null}
    </main>
  );
}
