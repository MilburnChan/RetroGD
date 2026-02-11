import type { Card, CardCombination } from "@retro/shared";
import { canBeatByRule } from "./rules/comparator";
import { evaluateCombinationWithRule } from "./rules/combination-evaluator";
import type { RuleOptions } from "./rules/wildcard";

const defaultRuleOptions = (levelRank = 2): RuleOptions => ({
  levelRank,
  wildcardEnabled: true
});

export const evaluateCombination = (cards: Card[], levelRank = 2): CardCombination => {
  return evaluateCombinationWithRule(cards, defaultRuleOptions(levelRank));
};

export const evaluateCombinationByRule = (cards: Card[], options: RuleOptions): CardCombination => {
  return evaluateCombinationWithRule(cards, options);
};

export const canBeat = (candidate: CardCombination, target: CardCombination | null): boolean => {
  return canBeatByRule(candidate, target);
};
