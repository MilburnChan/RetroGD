import type { PlayRecord } from "@retro/shared";
import { comboLabel } from "@/src/lib/combo-label";

interface TurnCompassProps {
  phase: string;
  currentPlayerName: string;
  lastPlay: PlayRecord | null;
  turnDeadlineMs: number | null;
  selectionHint: {
    valid: boolean;
    reason: string | null;
    previewComboType: string | null;
  };
  selectedCount: number;
}

const formatDeadline = (turnDeadlineMs: number | null): string => {
  if (!turnDeadlineMs || turnDeadlineMs <= 0) return "--";
  return `${Math.ceil(turnDeadlineMs / 1000)}s`;
};

export function TurnCompass({
  phase,
  currentPlayerName,
  lastPlay,
  turnDeadlineMs,
  selectionHint,
  selectedCount
}: TurnCompassProps) {
  return (
    <section className="turn-compass" aria-live="polite">
      <div className="turn-compass-ring" />
      <div className="turn-compass-core">
        <p className="turn-compass-phase">阶段 {phase}</p>
        <p className="turn-compass-player">{currentPlayerName}</p>
        <p className="turn-compass-timer">倒计时 {formatDeadline(turnDeadlineMs)}</p>
      </div>

      <div className="turn-compass-legend">
        <p className="turn-compass-legend-line">
          上手 {lastPlay ? `${comboLabel(lastPlay.combo.type)} · 主值 ${lastPlay.combo.primaryRank}` : "暂无"}
        </p>
        <p className={`turn-compass-legend-line ${selectionHint.valid ? "good" : "warn"}`}>
          {selectionHint.valid
            ? `已选 ${selectedCount} 张 · ${comboLabel(selectionHint.previewComboType)}`
            : selectionHint.reason ?? "请选择牌"}
        </p>
      </div>
    </section>
  );
}
