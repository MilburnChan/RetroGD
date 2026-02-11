interface NarrativeTopbarProps {
  roomCode: string;
  phase: string;
  actionSeq: number;
  roundNo: number;
  levelRank: number;
  wildcardEnabled: boolean;
  spectatorMode: boolean;
  narrativeLine: string | null;
  currentPlayerName: string;
  roundSummary: string | null;
  onBackRoom: () => void;
  onOpenReview: () => void;
  onDebugAi?: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenCoach?: () => void;
}

export function NarrativeTopbar({
  roomCode,
  phase,
  actionSeq,
  roundNo,
  levelRank,
  wildcardEnabled,
  spectatorMode,
  narrativeLine,
  currentPlayerName,
  roundSummary,
  onBackRoom,
  onOpenReview,
  onDebugAi,
  sidebarOpen,
  onToggleSidebar,
  onOpenCoach
}: NarrativeTopbarProps) {
  return (
    <section className="narrative-topbar pixel-panel">
      <div className="narrative-topbar-meta">
        <p className="narrative-badge">TABLE {roomCode}</p>
        <p className="narrative-inline">
          第 {roundNo} 局 · 阶段 {phase} · 轮次 {actionSeq} · 行动位 {currentPlayerName}
        </p>
        <p className="narrative-inline">级牌 {levelRank} · 逢人配 {wildcardEnabled ? "开启" : "关闭"}</p>
        {roundSummary ? <p className="narrative-inline highlight">{roundSummary}</p> : null}
        {spectatorMode ? <p className="narrative-inline warn">当前为观战态，仅可查看公开信息。</p> : null}
      </div>

      <p className="narrative-line">{narrativeLine ?? "牌势流动中，等待下一步。"} </p>

      <div className="narrative-topbar-actions">
        <button type="button" className="pixel-btn" onClick={onBackRoom}>
          返回房间
        </button>
        <button type="button" className="pixel-btn secondary" onClick={onOpenReview}>
          查看复盘
        </button>
        {onDebugAi ? (
          <button type="button" className="pixel-btn secondary" onClick={onDebugAi}>
            调试触发 AI
          </button>
        ) : null}
        <button type="button" className="pixel-btn" onClick={onToggleSidebar}>
          {sidebarOpen ? "收起信息" : "展开信息"}
        </button>
        {onOpenCoach ? (
          <button type="button" className="pixel-btn secondary" onClick={onOpenCoach} aria-label="打开新手提示">
            ?
          </button>
        ) : null}
      </div>
    </section>
  );
}
