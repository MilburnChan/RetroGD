import { buildFallbackReview, extractKeyMoments } from "@retro/ai-core";
import type { GameActionLog, GameReview, GameState } from "@retro/shared";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const parseJson = (raw: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const normalizeReview = (
  gameId: string,
  model: string,
  payload: Record<string, unknown>,
  logs: GameActionLog[]
): GameReview => {
  const keyMomentsFromModel = Array.isArray(payload.keyMoments)
    ? payload.keyMoments
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const seq = Number(row.seq);
          const playerId = String(row.playerId ?? "unknown");
          const why = String(row.why ?? "关键动作造成了节奏变化。");
          const impact = Number(row.impact ?? 0);
          if (Number.isNaN(seq) || Number.isNaN(impact)) return null;
          return { seq, playerId, why, impact };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  return {
    gameId,
    language: "zh-CN",
    summary: String(payload.summary ?? "本局关键在于牌权转换与资源节奏控制。"),
    keyMoments: keyMomentsFromModel.length > 0 ? keyMomentsFromModel : extractKeyMoments(logs, 5),
    alternatives: toStringArray(payload.alternatives),
    suggestions: toStringArray(payload.suggestions),
    createdAt: new Date().toISOString(),
    model
  };
};

export const generateReview = async (game: GameState, logs: GameActionLog[]): Promise<GameReview> => {
  const fallback = buildFallbackReview(game.id, logs);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  const model = process.env.OPENAI_REVIEW_MODEL ?? "gpt-4.1-mini";

  const prompt = {
    gameId: game.id,
    levelRank: game.levelRank,
    winnerTeam: game.winnerTeam,
    actionCount: logs.length,
    keyMoments: extractKeyMoments(logs, 5),
    logs: logs.slice(-40)
  };

  const system =
    "你是掼蛋复盘教练。你只输出 JSON，不输出多余文本。字段：summary, keyMoments(3-5), alternatives(2), suggestions(2)。";

  const user = `请基于以下对局数据给出中文复盘，并解释为什么这么打：\n${JSON.stringify(prompt)}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!resp.ok) {
      return fallback;
    }

    const data = (await resp.json()) as OpenAIResponse;
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      return fallback;
    }

    const parsed = parseJson(text);
    if (!parsed) {
      return fallback;
    }

    return normalizeReview(game.id, model, parsed, logs);
  } catch {
    return fallback;
  }
};
