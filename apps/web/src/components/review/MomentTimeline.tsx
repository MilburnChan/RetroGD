import type { KeyMoment } from "@retro/shared";
import { useMemo, useState } from "react";

interface MomentTimelineProps {
  moments: KeyMoment[];
  gameId: string;
}

const sortByImpact = (moments: KeyMoment[]): KeyMoment[] => {
  return [...moments].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
};

export function MomentTimeline({ moments, gameId }: MomentTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const ranked = useMemo(() => sortByImpact(moments), [moments]);
  const visible = expanded ? ranked : ranked.slice(0, 3);

  return (
    <section className="review-timeline pixel-panel">
      <header className="review-timeline-head">
        <h2>关键回合时间线</h2>
        <button type="button" className="pixel-btn secondary" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "收起" : "展开全部"}
        </button>
      </header>

      <div className="review-timeline-list">
        {visible.map((moment, idx) => (
          <article key={`${moment.seq}-${moment.playerId}-${idx}`} className="review-moment-card">
            <p className="review-moment-title">
              回合 #{moment.seq} · 玩家 {moment.playerId} · 影响 {moment.impact > 0 ? `+${moment.impact}` : moment.impact}
            </p>
            <p className="review-moment-text">{moment.why}</p>
            <a className="review-moment-link" href={`/games/${gameId}?focusSeq=${moment.seq}`}>
              回跳到该回合
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
