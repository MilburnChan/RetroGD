import type { PlayRecord, TableSeatView } from "@retro/shared";
import { CenterPile } from "./CenterPile";
import { SeatArea } from "./SeatArea";

interface TableBoardProps {
  seats: TableSeatView[];
  lastPlay: PlayRecord | null;
  phase: string;
  currentPlayerName: string;
  selectedCardIds: Set<string>;
  onToggleCard: (cardId: string) => void;
  canInteractCards: boolean;
  turnDeadlineMs: number | null;
  selectionHint: {
    valid: boolean;
    reason: string | null;
    previewComboType: string | null;
  };
}

const findSeat = (seats: TableSeatView[], position: TableSeatView["position"]): TableSeatView => {
  const seat = seats.find((item) => item.position === position);
  if (seat) return seat;

  return {
    seatIndex: -1,
    position,
    playerId: null,
    nickname: "空位",
    isAi: false,
    isCurrentTurn: false,
    isViewer: false,
    isTeammate: false,
    handCount: 0,
    visibleCards: []
  };
};

export function TableBoard({
  seats,
  lastPlay,
  phase,
  currentPlayerName,
  selectedCardIds,
  onToggleCard,
  canInteractCards,
  turnDeadlineMs,
  selectionHint
}: TableBoardProps) {
  const topSeat = findSeat(seats, "top");
  const leftSeat = findSeat(seats, "left");
  const rightSeat = findSeat(seats, "right");
  const bottomSeat = findSeat(seats, "bottom");

  return (
    <section className="table-felt">
      <div className="table-narrative-rails" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="table-seat table-seat-top">
        <SeatArea seat={topSeat} selectedCardIds={selectedCardIds} onToggleCard={onToggleCard} canInteract={canInteractCards} />
      </div>

      <div className="table-seat table-seat-left">
        <SeatArea seat={leftSeat} selectedCardIds={selectedCardIds} onToggleCard={onToggleCard} canInteract={canInteractCards} />
      </div>

      <div className="table-seat table-seat-right">
        <SeatArea seat={rightSeat} selectedCardIds={selectedCardIds} onToggleCard={onToggleCard} canInteract={canInteractCards} />
      </div>

      <div className="table-seat table-seat-bottom">
        <SeatArea
          seat={bottomSeat}
          selectedCardIds={selectedCardIds}
          onToggleCard={onToggleCard}
          canInteract={canInteractCards && bottomSeat.isViewer}
        />
      </div>

      <div className="table-center-wrap">
        <CenterPile
          phase={phase}
          currentPlayerName={currentPlayerName}
          lastPlay={lastPlay}
          turnDeadlineMs={turnDeadlineMs}
          selectionHint={selectionHint}
          selectedCount={selectedCardIds.size}
        />
      </div>
    </section>
  );
}
