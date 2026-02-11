import { applyPlayerAction, getLegalMoves, rankPower } from "@retro/game-engine";
import type {
  AiDifficulty,
  GameActionLog,
  GameReview,
  GameState,
  KeyMoment,
  PlayerActionInput
} from "@retro/shared";

export interface AiMoveDecision {
  action: PlayerActionInput;
  reasonCode: string;
  score: number;
}

const handRiskScore = (state: GameState, playerId: string): number => {
  const hand = state.hands[playerId] ?? [];
  const rankCost = hand.reduce((sum, card) => sum + rankPower(card.rank), 0);
  return rankCost + hand.length * 2;
};

const moveHeuristicScore = (
  state: GameState,
  playerId: string,
  move: ReturnType<typeof getLegalMoves>[number],
  difficulty: AiDifficulty
): number => {
  const targetCombo = state.lastPlay?.playerId !== playerId ? state.lastPlay?.combo ?? null : null;

  if (move.type === "pass") {
    let penalty = difficulty === "easy" ? -8 : -18;

    if (targetCombo && (targetCombo.type === "single" || targetCombo.type === "pair")) {
      penalty -= rankPower(targetCombo.primaryRank) <= 10 ? 14 : 8;
    } else if (targetCombo && (targetCombo.type === "triple" || targetCombo.type === "triple_with_pair")) {
      penalty -= 5;
    }

    return penalty;
  }

  const remain = (state.hands[playerId]?.length ?? 0) - move.cards.length;
  const combo = move.combo;
  if (!combo) return -100;

  let score = 0;

  if (remain === 0) {
    score += 200;
  }

  score += combo.type === "straight" ? 12 : 0;
  score += combo.type === "straight_flush" ? 16 : 0;
  score += combo.type === "consecutive_pairs" ? 13 : 0;
  score += combo.type === "steel" ? 14 : 0;
  score += combo.type === "triple_with_pair" ? 10 : 0;
  score += combo.type === "triple" ? 9 : 0;
  score += combo.type === "pair" ? 6 : 0;
  score += combo.type === "single" ? 3 : 0;

  if (targetCombo && combo.type === targetCombo.type) {
    score += 8;
    if (combo.type === "single" || combo.type === "pair") {
      const gap = Math.max(0, combo.primaryRank - targetCombo.primaryRank);
      score += Math.max(0, 10 - gap);
    }
  }

  if (combo.type === "bomb") {
    score += difficulty === "hard" ? 8 : -10;
    if (targetCombo && targetCombo.type === "single" && rankPower(targetCombo.primaryRank) <= 8) {
      score -= 18;
    }
  }
  if (combo.type === "straight_flush") {
    score += difficulty === "hard" ? 14 : 6;
    if (targetCombo && (targetCombo.type === "single" || targetCombo.type === "pair") && rankPower(targetCombo.primaryRank) <= 9) {
      score -= 12;
    }
  }
  if (combo.type === "joker_bomb") {
    score += difficulty === "hard" ? 18 : -6;
    if (targetCombo && (targetCombo.type === "single" || targetCombo.type === "pair")) {
      score -= 22;
    }
  }

  score -= combo.primaryRank / 3;
  score -= remain;

  return score;
};

const estimateFutureScore = (
  state: GameState,
  playerId: string,
  move: ReturnType<typeof getLegalMoves>[number]
): number => {
  try {
    const next = applyPlayerAction(state, playerId, {
      type: move.type,
      cardIds: move.cards.map((card) => card.id)
    }).state;

    const risk = handRiskScore(next, playerId);
    return -risk;
  } catch {
    return -999;
  }
};

export const chooseAiAction = (
  state: GameState,
  playerId: string,
  difficulty: AiDifficulty = "normal"
): AiMoveDecision => {
  const legalMoves = getLegalMoves(state, playerId);
  if (legalMoves.length === 0) {
    return {
      action: { type: "pass" },
      reasonCode: "ai_no_legal_move",
      score: -100
    };
  }

  const firstMove = legalMoves[0];
  if (!firstMove) {
    return {
      action: { type: "pass" },
      reasonCode: "ai_no_legal_move",
      score: -100
    };
  }

  let bestMove = firstMove;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestPlay: { move: ReturnType<typeof getLegalMoves>[number]; score: number } | null = null;
  let bestPassScore = Number.NEGATIVE_INFINITY;

  for (const move of legalMoves) {
    const base = moveHeuristicScore(state, playerId, move, difficulty);
    const future = difficulty === "hard" ? estimateFutureScore(state, playerId, move) : 0;
    const randomJitter = difficulty === "easy" ? Math.random() * 4 : Math.random();
    const score = base + future + randomJitter;

    if (move.type === "pass") {
      bestPassScore = Math.max(bestPassScore, score);
    } else if (!bestPlay || score > bestPlay.score) {
      bestPlay = { move, score };
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  const responding = Boolean(state.lastPlay && state.lastPlay.playerId !== playerId);
  if (responding && bestPlay && bestPassScore !== Number.NEGATIVE_INFINITY) {
    const threshold = difficulty === "easy" ? 2 : 7;
    if (bestPlay.score + threshold >= bestPassScore) {
      bestMove = bestPlay.move;
      bestScore = bestPlay.score;
    }
  }

  return {
    action:
      bestMove.type === "pass"
        ? { type: "pass" }
        : { type: "play", cardIds: bestMove.cards.map((card) => card.id) },
    reasonCode: bestMove.type === "pass" ? "ai_pass_pressure" : `ai_play_${bestMove.combo?.type ?? "unknown"}`,
    score: bestScore
  };
};

const reasonToChinese = (reasonCode: string): string => {
  if (reasonCode.includes("straight_flush")) return "同花顺在此轮属于高阶炸弹，可直接夺回牌权。";
  if (reasonCode.includes("bomb")) return "在关键节点使用炸弹改变牌权。";
  if (reasonCode.includes("steel")) return "通过钢板连续压制，强行夺回节奏。";
  if (reasonCode.includes("consecutive_pairs")) return "连对推进能持续施压并消化中段手牌。";
  if (reasonCode.includes("triple_with_pair")) return "三带二兼顾压制与控牌，减少后续卡手风险。";
  if (reasonCode.includes("straight")) return "通过顺子扩大出牌长度，减少手牌阻塞。";
  if (reasonCode.includes("triple")) return "通过三张压制对手并保留高价值牌。";
  if (reasonCode.includes("pair")) return "通过对子试探对手并控制节奏。";
  if (reasonCode.includes("single")) return "以单张过渡，避免暴露核心组合。";
  if (reasonCode.includes("trick_reset")) return "通过连续过牌重置牌权，等待更优起手。";
  if (reasonCode.includes("pass")) return "此处过牌是为了保留关键资源，降低被反制风险。";
  return "该动作对节奏和资源分配产生了影响。";
};

export const extractKeyMoments = (logs: GameActionLog[], topN = 5): KeyMoment[] => {
  const sorted = [...logs].sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta));
  return sorted.slice(0, topN).map((log) => ({
    seq: log.seq,
    playerId: log.playerId,
    why: reasonToChinese(log.reasonCode),
    impact: log.scoreDelta
  }));
};

export const buildFallbackReview = (gameId: string, logs: GameActionLog[]): GameReview => {
  const keyMoments = extractKeyMoments(logs, 5);
  const totalScore = logs.reduce((sum, log) => sum + log.scoreDelta, 0);

  return {
    gameId,
    language: "zh-CN",
    summary:
      totalScore >= 0
        ? "本局整体节奏偏主动，关键在于中后段对牌权的连续控制。"
        : "本局前中期资源交换偏被动，关键问题是失去牌权后的反制效率不足。",
    keyMoments,
    alternatives: [
      "当对手牌型不明时，优先用中段对子试探，再决定是否交高价值组合。",
      "若队友已建立优势，尽量保留炸弹用于终局封锁，而非中盘抢节奏。"
    ],
    suggestions: [
      "减少无收益的跟牌，避免在非关键轮次暴露高点数牌。",
      "在出完中段牌型后，提前规划收官顺序，保证最后 2-3 手可连贯出完。"
    ],
    createdAt: new Date().toISOString(),
    model: "fallback-rules"
  };
};
