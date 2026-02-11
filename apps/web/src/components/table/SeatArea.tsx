import type { TableSeatView } from "@retro/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { CardBack } from "./CardBack";
import { PlayingCard } from "./PlayingCard";

interface SeatAreaProps {
  seat: TableSeatView;
  selectedCardIds: Set<string>;
  onToggleCard: (cardId: string) => void;
  canInteract: boolean;
}

export interface ViewerHandLayout {
  cardWidth: number;
  cardHeight: number;
  step: number;
  contentWidth: number;
  allowScroll: boolean;
}

export interface HoverState {
  hoveredIndex: number | null;
  lastPointerX: number | null;
}

export const HAND_CARD_WIDTH = 100;
export const MIN_VISIBLE_STRIP = 30;
export const HAND_CARD_GAP = 12;
export const HAND_CARD_HEIGHT = Math.round((HAND_CARD_WIDTH * 104) / 72);
export const HOVER_HYSTERESIS_PX = 6;

export const computeViewerHandLayout = (containerWidth: number, cardCount: number): ViewerHandLayout => {
  const cardWidth = HAND_CARD_WIDTH;
  const cardHeight = HAND_CARD_HEIGHT;
  const normalStep = cardWidth + HAND_CARD_GAP;

  if (cardCount <= 1 || containerWidth <= 0) {
    return {
      cardWidth,
      cardHeight,
      step: normalStep,
      contentWidth: cardWidth,
      allowScroll: false
    };
  }

  const naturalWidth = cardWidth + (cardCount - 1) * normalStep;
  if (containerWidth >= naturalWidth) {
    return {
      cardWidth,
      cardHeight,
      step: normalStep,
      contentWidth: naturalWidth,
      allowScroll: false
    };
  }

  const compressedStep = Math.floor((containerWidth - cardWidth) / (cardCount - 1));
  if (compressedStep >= MIN_VISIBLE_STRIP) {
    const contentWidth = cardWidth + (cardCount - 1) * compressedStep;
    return {
      cardWidth,
      cardHeight,
      step: compressedStep,
      contentWidth,
      allowScroll: false
    };
  }

  const minRequired = cardWidth + (cardCount - 1) * MIN_VISIBLE_STRIP;
  return {
    cardWidth,
    cardHeight,
    step: MIN_VISIBLE_STRIP,
    contentWidth: minRequired,
    allowScroll: true
  };
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const indexFromPointerX = (pointerX: number, step: number, cardCount: number): number => {
  if (cardCount <= 1) return 0;
  if (step <= 0) return 0;
  return clamp(Math.round(pointerX / step), 0, cardCount - 1);
};

export const resolveHoverState = (
  pointerX: number,
  cardCount: number,
  step: number,
  previous: HoverState,
  hysteresisPx = HOVER_HYSTERESIS_PX
): HoverState => {
  if (cardCount <= 0) {
    return {
      hoveredIndex: null,
      lastPointerX: pointerX
    };
  }

  if (previous.hoveredIndex === null) {
    return {
      hoveredIndex: indexFromPointerX(pointerX, step, cardCount),
      lastPointerX: pointerX
    };
  }

  const currentIndex = clamp(previous.hoveredIndex, 0, cardCount - 1);
  const leftBoundary = (currentIndex - 0.5) * step - hysteresisPx;
  const rightBoundary = (currentIndex + 0.5) * step + hysteresisPx;
  const shouldSwitch = pointerX < leftBoundary || pointerX > rightBoundary;

  return {
    hoveredIndex: shouldSwitch ? indexFromPointerX(pointerX, step, cardCount) : currentIndex,
    lastPointerX: pointerX
  };
};

export function SeatArea({ seat, selectedCardIds, onToggleCard, canInteract }: SeatAreaProps) {
  const previewCount = Math.max(1, Math.min(8, seat.handCount));
  const viewerCardsRef = useRef<HTMLDivElement | null>(null);
  const viewerTrackRef = useRef<HTMLDivElement | null>(null);
  const [viewerContainerWidth, setViewerContainerWidth] = useState(0);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [hoveredCardIndex, setHoveredCardIndex] = useState<number | null>(null);
  const hoverStateRef = useRef<HoverState>({ hoveredIndex: null, lastPointerX: null });
  const pendingPointerXRef = useRef<number | null>(null);
  const hoverRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!seat.isViewer) return;
    const element = viewerCardsRef.current;
    if (!element) return;

    const updateWidth = (): void => {
      setViewerContainerWidth(element.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [seat.isViewer]);

  const viewerLayout = useMemo(() => {
    if (!seat.isViewer) {
      return computeViewerHandLayout(0, seat.visibleCards.length);
    }
    return computeViewerHandLayout(viewerContainerWidth, seat.visibleCards.length);
  }, [seat.isViewer, seat.visibleCards.length, viewerContainerWidth]);

  const previewCard = seat.visibleCards.find((card) => card.id === previewCardId) ?? null;
  const accordionOffset = 8;

  useEffect(() => {
    if (hoveredCardIndex === null) return;
    if (hoveredCardIndex < seat.visibleCards.length) return;
    hoverStateRef.current = { hoveredIndex: null, lastPointerX: null };
    setHoveredCardIndex(null);
  }, [hoveredCardIndex, seat.visibleCards.length]);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current !== null) {
        window.cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, []);

  const flushHoverPointer = (): void => {
    hoverRafRef.current = null;
    const pointerX = pendingPointerXRef.current;
    pendingPointerXRef.current = null;
    if (pointerX === null) return;

    const nextState = resolveHoverState(
      pointerX,
      seat.visibleCards.length,
      viewerLayout.step,
      hoverStateRef.current
    );
    hoverStateRef.current = nextState;
    setHoveredCardIndex(nextState.hoveredIndex);
  };

  const scheduleHoverUpdate = (clientX: number): void => {
    const track = viewerTrackRef.current;
    const container = viewerCardsRef.current;
    if (!track || !container) return;

    const trackRect = track.getBoundingClientRect();
    pendingPointerXRef.current = clientX - trackRect.left + container.scrollLeft;

    if (hoverRafRef.current !== null) return;
    hoverRafRef.current = window.requestAnimationFrame(flushHoverPointer);
  };

  const resetHover = (): void => {
    pendingPointerXRef.current = null;
    if (hoverRafRef.current !== null) {
      window.cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    hoverStateRef.current = { hoveredIndex: null, lastPointerX: null };
    setHoveredCardIndex(null);
  };

  return (
    <section className={`seat-area seat-area-${seat.position} ${seat.isCurrentTurn ? "seat-active" : ""}`}>
      <header className="seat-head">
        <p className="seat-name">{seat.nickname}</p>
        <p className="seat-meta">
          <span>{seat.isViewer ? "我方主视角" : seat.isTeammate ? "队友位" : "对手位"}</span>
          <span>{seat.isAi ? "AI" : "真人"}</span>
          <span>{seat.isCurrentTurn ? "行动中" : "等待中"}</span>
          <span>剩余 {seat.handCount}</span>
        </p>
      </header>

      {seat.isViewer ? (
        <div
          ref={viewerCardsRef}
          className={`seat-cards seat-cards-bottom seat-cards-dynamic ${viewerLayout.allowScroll ? "seat-cards-scrollable" : ""}`}
          style={{ minHeight: viewerLayout.cardHeight + 30 }}
        >
          <div
            ref={viewerTrackRef}
            className="seat-cards-track"
            style={{
              width: `${viewerLayout.contentWidth + (hoveredCardIndex !== null ? accordionOffset : 0)}px`,
              height: `${viewerLayout.cardHeight + 28}px`
            }}
            onPointerMove={(event) => {
              scheduleHoverUpdate(event.clientX);
            }}
            onPointerLeave={resetHover}
          >
          {seat.visibleCards.map((card, index) => {
            const selected = selectedCardIds.has(card.id);
            const hovered = hoveredCardIndex === index;
            const shiftedRight = hoveredCardIndex !== null && index > hoveredCardIndex;
            const left = index * viewerLayout.step;
            const shiftX = shiftedRight ? accordionOffset : 0;
            const liftY = hovered ? 20 : selected ? 12 : 0;
            return (
              <div
                key={card.id}
                className={`seat-card-stack-item ${selected ? "selected" : ""} ${hovered ? "hovered" : ""}`}
                style={{
                  left: `${left}px`,
                  zIndex: hovered ? 5000 : selected ? 3000 + index : 100 + index,
                  transform: `translate(${shiftX}px, -${liftY}px)`,
                  width: `${viewerLayout.cardWidth}px`,
                  height: `${viewerLayout.cardHeight}px`
                }}
              >
                <PlayingCard
                  card={card}
                  selected={selected}
                  interactive={canInteract}
                  disabledVisual={!canInteract}
                  disableHoverLift
                  size={{ width: viewerLayout.cardWidth, height: viewerLayout.cardHeight }}
                  onClick={() => onToggleCard(card.id)}
                  onLongPress={() => setPreviewCardId(card.id)}
                />
              </div>
            );
          })}
          </div>
        </div>
      ) : (
        <div className="seat-cards seat-cards-hidden">
          {Array.from({ length: previewCount }).map((_, index) => (
            <div key={`back-${seat.seatIndex}-${index}`} className="seat-hidden-card" style={{ marginLeft: index === 0 ? 0 : -42 }}>
              <CardBack small />
            </div>
          ))}
          <span className="seat-count-badge">{seat.handCount}</span>
        </div>
      )}

      {previewCard ? (
        <div className="card-preview-overlay" role="dialog" aria-modal="true">
          <div className="card-preview-card pixel-panel">
            <p className="card-preview-title">牌面预览</p>
            <PlayingCard card={previewCard} size={{ width: 144, height: 208 }} />
            <button type="button" className="pixel-btn secondary" onClick={() => setPreviewCardId(null)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
