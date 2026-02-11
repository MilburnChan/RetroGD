import { useRef } from "react";
import type { CSSProperties } from "react";
import type { Card } from "@retro/shared";
import styles from "./PlayingCard.module.css";

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  interactive?: boolean;
  disabledVisual?: boolean;
  disableHoverLift?: boolean;
  small?: boolean;
  size?: {
    width: number;
    height: number;
  };
  onClick?: () => void;
  onLongPress?: () => void;
}

type NormalSuit = "S" | "H" | "C" | "D";

const rankLabel = (rank: number): string => {
  if (rank <= 10) return String(rank);
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  if (rank === 16) return "B";
  if (rank === 17) return "R";
  return String(rank);
};

const isRedSuit = (suit: Card["suit"]): boolean => suit === "H" || suit === "D" || suit === "RJ";

const suitLabelZh: Record<Card["suit"], string> = {
  S: "黑桃",
  H: "红桃",
  C: "梅花",
  D: "方块",
  BJ: "小王",
  RJ: "大王"
};

const isNormalSuit = (suit: Card["suit"]): suit is NormalSuit => suit === "S" || suit === "H" || suit === "C" || suit === "D";

const SuitGlyphShape = ({ suit, fill, strokeWidth }: { suit: NormalSuit; fill: string; strokeWidth: number }) => {
  const common = {
    fill,
    stroke: "#111111",
    strokeWidth,
    shapeRendering: "crispEdges" as const
  };

  if (suit === "D") {
    return <polygon points="0,-5.5 4.3,0 0,5.5 -4.3,0" {...common} />;
  }

  if (suit === "H") {
    return (
      <>
        <circle cx="-2.2" cy="-1.4" r="2.5" {...common} />
        <circle cx="2.2" cy="-1.4" r="2.5" {...common} />
        <polygon points="-5,0 5,0 0,6.2" {...common} />
      </>
    );
  }

  if (suit === "C") {
    return (
      <>
        <circle cx="-2.2" cy="-0.8" r="2.4" {...common} />
        <circle cx="2.2" cy="-0.8" r="2.4" {...common} />
        <circle cx="0" cy="2.4" r="2.6" {...common} />
        <rect x="-1.05" y="3.9" width="2.1" height="3.3" {...common} />
        <rect x="-2.2" y="6.7" width="4.4" height="1.2" {...common} />
      </>
    );
  }

  return (
    <>
      <circle cx="-2.2" cy="0.7" r="2.3" {...common} />
      <circle cx="2.2" cy="0.7" r="2.3" {...common} />
      <polygon points="-4.8,0.2 4.8,0.2 0,-6.3" {...common} />
      <rect x="-1.05" y="3" width="2.1" height="3.3" {...common} />
      <rect x="-2.2" y="6" width="4.4" height="1.2" {...common} />
    </>
  );
};

const SuitGlyph = ({
  suit,
  red,
  className,
  small
}: {
  suit: NormalSuit;
  red: boolean;
  className?: string;
  small?: boolean;
}) => {
  const fill = red ? "#A11F1F" : "#2D2D2D";
  const strokeWidth = small ? 0.8 : 1;

  return (
    <svg className={className} viewBox="-7 -7 14 14" role="presentation" aria-hidden="true" shapeRendering="crispEdges">
      <SuitGlyphShape suit={suit} fill={fill} strokeWidth={strokeWidth} />
    </svg>
  );
};

export function PlayingCard({
  card,
  selected = false,
  interactive = false,
  disabledVisual = false,
  disableHoverLift = false,
  small = false,
  size,
  onClick,
  onLongPress
}: PlayingCardProps) {
  const rank = rankLabel(card.rank);
  const ariaLabel = `${suitLabelZh[card.suit]}${rank}`;
  const red = isRedSuit(card.suit);

  const classes = [
    styles.card,
    small ? styles.small : "",
    selected ? styles.selected : "",
    interactive ? styles.interactive : "",
    disableHoverLift ? styles.disableHoverLift : "",
    red ? styles.red : styles.black
  ]
    .filter(Boolean)
    .join(" ");

  const cardStyle: CSSProperties | undefined = size
    ? {
        width: `${size.width}px`,
        height: `${size.height}px`
      }
    : undefined;

  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPressTimer = (): void => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (): void => {
    if (!interactive || !onLongPress) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress();
    }, 220);
  };

  const handlePointerUp = (): void => {
    clearLongPressTimer();
  };

  const handleClick = (): void => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onClick?.();
  };

  const cornerSuit = isNormalSuit(card.suit) ? (
    <SuitGlyph suit={card.suit} red={red} className={styles.cornerSuitIcon} small={small} />
  ) : (
    <span className={styles.cornerJokerSuit}>J</span>
  );

  const cornerNode = (
    <span className={styles.cornerChip}>
      <span className={styles.cornerRank}>{rank}</span>
      {cornerSuit}
    </span>
  );

  const centerNode = isNormalSuit(card.suit) ? (
    <SuitGlyph suit={card.suit} red={red} className={styles.centerSuitIcon} />
  ) : (
    <div className={styles.jokerCenter}>
      <span className={styles.jokerMark}>{card.suit === "RJ" ? "RJ" : "BJ"}</span>
      <span className={styles.jokerLabel}>JOKER</span>
    </div>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={classes}
        style={cardStyle}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        aria-pressed={selected}
        aria-label={ariaLabel}
      >
        <span className={`${styles.corner} ${styles.topLeft}`}>{cornerNode}</span>
        <span className={`${styles.corner} ${styles.topRight}`}>{cornerNode}</span>
        <span className={`${styles.corner} ${styles.bottomLeft}`}>{cornerNode}</span>
        <span className={`${styles.corner} ${styles.bottomRight}`}>{cornerNode}</span>
        <span className={styles.center}>{centerNode}</span>
        {disabledVisual ? <span className={styles.disabledMask} /> : null}
      </button>
    );
  }

  return (
    <div className={classes} style={cardStyle} role="img" aria-label={ariaLabel}>
      <span className={`${styles.corner} ${styles.topLeft}`}>{cornerNode}</span>
      <span className={`${styles.corner} ${styles.topRight}`}>{cornerNode}</span>
      <span className={`${styles.corner} ${styles.bottomLeft}`}>{cornerNode}</span>
      <span className={`${styles.corner} ${styles.bottomRight}`}>{cornerNode}</span>
      <span className={styles.center}>{centerNode}</span>
      {disabledVisual ? <span className={styles.disabledMask} /> : null}
    </div>
  );
}
