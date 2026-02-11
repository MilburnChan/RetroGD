"use client";

import type { GameReview } from "@retro/shared";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MomentTimeline } from "@/src/components/review/MomentTimeline";

export default function ReviewPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId ?? "";
  const [review, setReview] = useState<GameReview | null>(null);
  const [message, setMessage] = useState("正在生成复盘...");
  const [expandedAlt, setExpandedAlt] = useState(false);
  const [expandedTips, setExpandedTips] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    fetch(`/api/games/${gameId}/review`, { method: "POST" })
      .then(async (res) => {
        const data = (await res.json()) as { review?: GameReview; error?: { message: string } };
        if (!res.ok || !data.review) {
          setMessage(data.error?.message ?? "复盘生成失败");
          return;
        }
        setReview(data.review);
        setMessage("");
      })
      .catch(() => setMessage("复盘生成失败"));
  }, [gameId]);

  if (!review) {
    return (
      <main className="review-shell">
        <div className="pixel-panel review-loading">{message}</div>
      </main>
    );
  }

  const visibleAlternatives = expandedAlt ? review.alternatives : review.alternatives.slice(0, 3);
  const visibleSuggestions = expandedTips ? review.suggestions : review.suggestions.slice(0, 3);

  return (
    <main className="review-shell">
      <section className="review-summary pixel-panel">
        <p className="review-kicker">AI REVIEW</p>
        <h1>对局复盘</h1>
        <p>{review.summary}</p>
        <p className="review-model">模型：{review.model}</p>
      </section>

      <MomentTimeline moments={review.keyMoments} gameId={review.gameId} />

      <section className="review-grid">
        <article className="pixel-panel review-column">
          <div className="review-column-head">
            <h3>可替代打法</h3>
            <button type="button" className="pixel-btn secondary" onClick={() => setExpandedAlt((prev) => !prev)}>
              {expandedAlt ? "收起" : "展开"}
            </button>
          </div>
          <ul>
            {visibleAlternatives.map((alt) => (
              <li key={alt}>{alt}</li>
            ))}
          </ul>
        </article>

        <article className="pixel-panel review-column">
          <div className="review-column-head">
            <h3>下次建议</h3>
            <button type="button" className="pixel-btn secondary" onClick={() => setExpandedTips((prev) => !prev)}>
              {expandedTips ? "收起" : "展开"}
            </button>
          </div>
          <ul>
            {visibleSuggestions.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </article>
      </section>

      <div className="review-actions">
        <button className="pixel-btn" onClick={() => window.history.back()}>
          返回牌桌
        </button>
        <button className="pixel-btn secondary" onClick={() => window.location.assign(`/games/${review.gameId}`)}>
          进入牌桌
        </button>
      </div>
    </main>
  );
}
