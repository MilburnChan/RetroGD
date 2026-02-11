import type { GameActionLog } from "@retro/shared";

interface CollapsibleSidebarProps {
  open: boolean;
  logs: GameActionLog[];
  finishedOrder: string[];
  winnerTeam: number | null;
  playerNameById: Record<string, string>;
}

const formatPlayer = (playerId: string, playerNameById: Record<string, string>): string => {
  return playerNameById[playerId] ?? playerId;
};

export function CollapsibleSidebar({
  open,
  logs,
  finishedOrder,
  winnerTeam,
  playerNameById
}: CollapsibleSidebarProps) {
  return (
    <aside className={`table-sidebar ${open ? "open" : ""}`}>
      <div className="table-sidebar-content pixel-panel p-3">
        <section>
          <h3 className="sidebar-title">名次</h3>
          {finishedOrder.length === 0 ? (
            <p className="sidebar-text">尚无人出完</p>
          ) : (
            <div className="sidebar-list">
              {finishedOrder.map((playerId, idx) => (
                <p className="sidebar-text" key={`rank-${playerId}`}>
                  #{idx + 1} {formatPlayer(playerId, playerNameById)}
                </p>
              ))}
            </div>
          )}
          {winnerTeam !== null ? <p className="sidebar-text">胜方队伍: Team {winnerTeam}</p> : null}
        </section>

        <section className="mt-4">
          <h3 className="sidebar-title">最近动作</h3>
          <div className="sidebar-list">
            {logs.slice(-10).reverse().map((log) => (
              <p className="sidebar-text" key={`log-${log.seq}`}>
                #{log.seq} {formatPlayer(log.playerId, playerNameById)} · {log.type} · {log.reasonCode}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-4">
          <h3 className="sidebar-title">规则提示</h3>
          <div className="sidebar-list">
            <p className="sidebar-text">跟牌需同牌型同长度，且主值更大。</p>
            <p className="sidebar-text">贡牌阶段：进贡最大牌，还贡任意牌。</p>
            <p className="sidebar-text">双王抗贡则跳过贡牌，直接进入下一局。</p>
          </div>
        </section>
      </div>
    </aside>
  );
}
