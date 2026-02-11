import type { CardCombination } from "@retro/shared";

const sameLengthRequired = new Set(["straight", "straight_flush", "consecutive_pairs", "steel", "pair", "triple", "triple_with_pair"]);

export const canBeatByRule = (candidate: CardCombination, target: CardCombination | null): boolean => {
  if (candidate.type === "invalid") return false;
  if (!target || target.type === "invalid") return true;

  if (candidate.type === "joker_bomb") {
    return target.type !== "joker_bomb";
  }
  if (target.type === "joker_bomb") {
    return false;
  }

  if (candidate.type === "straight_flush") {
    if (target.type === "straight_flush") {
      return candidate.primaryRank > target.primaryRank;
    }
    if (target.type === "bomb") {
      return target.length <= 5;
    }
    return true;
  }

  if (target.type === "straight_flush") {
    if (candidate.type === "bomb") {
      return candidate.length >= 6;
    }
    return false;
  }

  if (candidate.type === "bomb" && target.type !== "bomb") {
    return true;
  }
  if (candidate.type !== "bomb" && target.type === "bomb") {
    return false;
  }

  if (candidate.type !== target.type) {
    return false;
  }

  if (candidate.type === "bomb") {
    if (candidate.length !== target.length) {
      return candidate.length > target.length;
    }
    return candidate.primaryRank > target.primaryRank;
  }

  if (sameLengthRequired.has(candidate.type) && candidate.length !== target.length) {
    return false;
  }

  return candidate.primaryRank > target.primaryRank;
};
