import type { PlayRecord } from "@retro/shared";
import { comboLabel } from "@/src/lib/combo-label";
import { PlayingCard } from "./PlayingCard";
import { TurnCompass } from "./TurnCompass";

interface CenterPileProps {
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

export function CenterPile({
  phase,
  currentPlayerName,
  lastPlay,
  turnDeadlineMs,
  selectionHint,
  selectedCount
}: CenterPileProps) {
  return (
    <section className="center-pile">
      <TurnCompass
        phase={phase}
        currentPlayerName={currentPlayerName}
        lastPlay={lastPlay}
        turnDeadlineMs={turnDeadlineMs}
        selectionHint={selectionHint}
        selectedCount={selectedCount}
      />

      <div className="center-played-cards pixel-panel">
        {lastPlay ? (
          <>
            <p className="center-played-title">
              上手: {lastPlay.playerId} · {comboLabel(lastPlay.combo.type)} · 主值 {lastPlay.combo.primaryRank}
            </p>
            <div className="center-played-list">
              {lastPlay.cards.map((card) => (
                <PlayingCard key={`${lastPlay.seq}-${card.id}`} card={card} small />
              ))}
            </div>
          </>
        ) : (
          <p className="center-played-empty">暂无出牌，等待首家。</p>
        )}
      </div>
    </section>
  );
}
