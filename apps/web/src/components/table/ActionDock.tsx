import type { PendingAction } from "@retro/shared";
import { comboLabel } from "@/src/lib/combo-label";

interface ActionDockProps {
  spectatorMode: boolean;
  loadingAction: boolean;
  myTurn: boolean;
  tributeWaiting: boolean;
  pendingAction: PendingAction | null;
  selectedCount: number;
  selectionHint: {
    valid: boolean;
    reason: string | null;
    previewComboType: string | null;
  };
  pendingPlayMs: number | null;
  handArrangeMode: "default" | "power";
  powerCandidateIndex: number;
  powerCandidateCount: number;
  onConfirmPlay: () => void;
  onUndoPendingPlay: () => void;
  onPass: () => void;
  onClearSelection: () => void;
  onTogglePowerArrange: () => void;
  onResetArrange: () => void;
  onTributeGive: () => void;
  onTributeReturn: () => void;
}

const pendingSeconds = (ms: number | null): string => {
  if (!ms || ms <= 0) return "0.0";
  return (Math.max(ms, 0) / 1000).toFixed(1);
};

export function ActionDock({
  spectatorMode,
  loadingAction,
  myTurn,
  tributeWaiting,
  pendingAction,
  selectedCount,
  selectionHint,
  pendingPlayMs,
  handArrangeMode,
  powerCandidateIndex,
  powerCandidateCount,
  onConfirmPlay,
  onUndoPendingPlay,
  onPass,
  onClearSelection,
  onTogglePowerArrange,
  onResetArrange,
  onTributeGive,
  onTributeReturn
}: ActionDockProps) {
  const pendingPlay = pendingPlayMs !== null;
  const canPlay = !spectatorMode && !loadingAction && myTurn && !tributeWaiting && selectionHint.valid && selectedCount > 0;

  return (
    <section className="action-dock pixel-panel">
      <div className="action-dock-main">
        <button type="button" className="pixel-btn action-btn-primary" disabled={!canPlay || pendingPlay} onClick={onConfirmPlay}>
          {pendingPlay ? "已确认，等待落牌" : "确认出牌"}
        </button>
        <button
          type="button"
          className="pixel-btn secondary"
          disabled={!pendingPlay}
          onClick={onUndoPendingPlay}
        >
          撤销 ({pendingSeconds(pendingPlayMs)}s)
        </button>
        <button type="button" className="pixel-btn danger" disabled={spectatorMode || !myTurn || loadingAction || tributeWaiting} onClick={onPass}>
          过牌
        </button>
      </div>

      <div className="action-dock-aux">
        <button type="button" className="pixel-btn secondary" disabled={spectatorMode || selectedCount === 0} onClick={onClearSelection}>
          取消选择
        </button>
        <button type="button" className="pixel-btn secondary" disabled={spectatorMode || loadingAction} onClick={onTogglePowerArrange}>
          一键整理强牌
        </button>
        <button
          type="button"
          className="pixel-btn secondary"
          disabled={spectatorMode || loadingAction || handArrangeMode === "default"}
          onClick={onResetArrange}
        >
          恢复默认排序
        </button>
        <button
          type="button"
          className="pixel-btn"
          disabled={spectatorMode || loadingAction || pendingAction?.action !== "tribute_give" || selectedCount !== 1}
          onClick={onTributeGive}
        >
          进贡
        </button>
        <button
          type="button"
          className="pixel-btn secondary"
          disabled={spectatorMode || loadingAction || pendingAction?.action !== "tribute_return" || selectedCount !== 1}
          onClick={onTributeReturn}
        >
          还贡
        </button>
      </div>

      <p className={`action-dock-hint ${selectionHint.valid ? "ok" : "warn"}`}>
        {spectatorMode
          ? "观战态：返回房间重新加入后可操作。"
          : pendingAction
            ? pendingAction.action === "tribute_give"
              ? "请选择 1 张最大牌进贡。"
              : "请选择 1 张牌还贡。"
            : selectionHint.valid
              ? `已选 ${selectedCount} 张 · 牌型 ${comboLabel(selectionHint.previewComboType)} · 强牌方案 ${powerCandidateIndex + 1}/${powerCandidateCount}`
              : selectionHint.reason ?? "请选择牌后操作。"}
      </p>
    </section>
  );
}
