"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Seat = {
  seatIndex: number;
  playerId: string | null;
  nickname: string;
  isAi: boolean;
  ready: boolean;
  connected: boolean;
};

type RoomSnapshot = {
  roomId: string;
  roomCode: string;
  status: "waiting" | "ready" | "playing" | "finished";
  ownerSeatIndex: number;
  levelRank: number;
  seats: Seat[];
  gameId: string | null;
};

type ViewerContext = {
  viewerSeatIndex: number | null;
  viewerPlayerId: string | null;
  isOwner: boolean;
};

const positionLabel = ["下家位", "右位", "上家位", "左位"];

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId ?? "";
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [viewer, setViewer] = useState<ViewerContext>({
    viewerSeatIndex: null,
    viewerPlayerId: null,
    isOwner: false
  });
  const [message, setMessage] = useState("");
  const [starting, setStarting] = useState(false);

  const loadRoom = async (id: string) => {
    const res = await fetch(`/api/rooms/${id}`, { cache: "no-store" });
    const data = (await res.json()) as {
      roomSnapshot?: RoomSnapshot;
      viewer?: ViewerContext;
      error?: { message: string };
    };

    if (!res.ok || !data.roomSnapshot) {
      setMessage(data.error?.message ?? "房间加载失败");
      return;
    }

    setRoom(data.roomSnapshot);
    setViewer(
      data.viewer ?? {
        viewerSeatIndex: null,
        viewerPlayerId: null,
        isOwner: false
      }
    );
    setMessage("");
  };

  useEffect(() => {
    if (!roomId) return;

    loadRoom(roomId).catch(() => setMessage("房间加载失败"));
    const timer = setInterval(() => {
      loadRoom(roomId).catch(() => undefined);
    }, 2000);

    return () => clearInterval(timer);
  }, [roomId]);

  const occupied = useMemo(
    () => room?.seats.filter((seat) => Boolean(seat.playerId)).length ?? 0,
    [room?.seats]
  );

  const sortedSeats = useMemo(() => {
    if (!room) return [];
    const anchor = viewer.viewerSeatIndex ?? room.ownerSeatIndex;
    return room.seats
      .map((seat) => {
        const delta = (seat.seatIndex - anchor + 4) % 4;
        return {
          ...seat,
          delta,
          position: positionLabel[delta] ?? "座位"
        };
      })
      .sort((a, b) => a.delta - b.delta);
  }, [room, viewer.viewerSeatIndex]);

  const startGame = async () => {
    if (!room) return;

    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${room.roomId}/start`, {
        method: "POST"
      });

      const data = (await res.json()) as { game?: { id: string }; error?: { message: string } };
      if (!res.ok || !data.game?.id) {
        setMessage(data.error?.message ?? "开局失败");
        return;
      }

      window.location.href = `/games/${data.game.id}`;
    } finally {
      setStarting(false);
    }
  };

  if (!room) {
    return (
      <main className="room-shell">
        <div className="pixel-panel room-loading">正在加载房间...</div>
      </main>
    );
  }

  return (
    <main className="room-shell">
      <section className="room-header pixel-panel">
        <p className="room-kicker">ROOM LOBBY</p>
        <h1>房间码：{room.roomCode}</h1>
        <p>
          当前状态：{room.status} · 人数：{occupied}/4 · 空位将由 AI 自动补位
        </p>
        <p>当前级牌：{room.levelRank}</p>
      </section>

      <section className="room-seat-stage pixel-panel">
        <div className="room-seat-grid" role="list">
          {sortedSeats.map((seat) => (
            <article
              key={seat.seatIndex}
              role="listitem"
              className={`room-seat-card ${seat.playerId === viewer.viewerPlayerId ? "active" : ""}`}
            >
              <p className="room-seat-pos">{seat.position}</p>
              <p className="room-seat-name">{seat.playerId ? seat.nickname : "空位"}</p>
              <p className="room-seat-meta">
                {seat.isAi ? "AI" : "真人"} · {seat.connected ? "在线" : "离线"}
              </p>
              <p className="room-seat-meta">{seat.ready ? "已准备" : "未准备"}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="room-actions-inline">
        <button className="pixel-btn" onClick={() => window.location.assign("/")}>返回大厅</button>
        {room.gameId ? (
          <button className="pixel-btn secondary" onClick={() => window.location.assign(`/games/${room.gameId}`)}>
            进入牌桌
          </button>
        ) : null}
        {!viewer.isOwner ? <p className="room-owner-wait">等待房主开局</p> : null}
      </section>

      {viewer.isOwner ? (
        <button className="pixel-btn room-owner-float" disabled={starting} onClick={() => void startGame()}>
          {starting ? "开局中..." : "房主开始对局"}
        </button>
      ) : null}

      {message ? <p className="pixel-panel room-message">{message}</p> : null}
    </main>
  );
}
