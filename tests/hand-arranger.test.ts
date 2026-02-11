import { describe, expect, it } from "vitest";
import type { Card } from "@retro/shared";
import {
  arrangeHandByPower,
  buildPowerArrangeCandidates,
  derivePowerPreference,
  selectPowerCandidate
} from "../apps/web/src/lib/hand-arranger";

const card = (id: string, suit: Card["suit"], rank: number): Card => ({
  id,
  suit,
  rank,
  display: `${suit}${rank}`
});

describe("hand arranger", () => {
  it("puts joker bomb at the far left", () => {
    const hand = [
      card("b1", "BJ", 16),
      card("b2", "BJ", 16),
      card("r1", "RJ", 17),
      card("r2", "RJ", 17),
      card("x1", "S", 8),
      card("x2", "D", 8)
    ];

    const result = arrangeHandByPower(hand, 2, 0);
    expect(result.groups[0]?.type).toBe("joker_bomb");
    expect(result.cards.slice(0, 4).every((item) => item.suit === "BJ" || item.suit === "RJ")).toBe(true);
  });

  it("supports wildcard straight flush slot mapping while keeping real card value", () => {
    const hand = [
      card("s10", "S", 10),
      card("sq", "S", 12),
      card("sk", "S", 13),
      card("sa", "S", 14),
      card("h2wild", "H", 2),
      card("x1", "C", 4),
      card("x2", "D", 4),
      card("x3", "S", 4),
      card("x4", "H", 4)
    ];

    const result = arrangeHandByPower(hand, 2, 0);
    const straightGroup = result.groups.find((group) => group.type === "straight_flush");

    expect(straightGroup).toBeDefined();
    const jSlot = straightGroup?.slots?.find((slot) => slot.slotRank === 11);
    expect(jSlot?.cardId).toBe("h2wild");

    const arrangedWildcardCard = straightGroup?.cards.find((c) => c.id === "h2wild");
    expect(arrangedWildcardCard?.rank).toBe(2);
  });

  it("generates multiple power candidates for one hand", () => {
    const hand = [
      card("s9", "S", 9),
      card("s10", "S", 10),
      card("s11", "S", 11),
      card("s12", "S", 12),
      card("h2wild", "H", 2),
      card("c9", "C", 9),
      card("d9", "D", 9),
      card("h9", "H", 9),
      card("c10", "C", 10),
      card("d10", "D", 10),
      card("h10", "H", 10)
    ];

    const candidates = buildPowerArrangeCandidates(hand, 2, 12);
    const signatures = new Set(candidates.map((item) => item.signature));

    expect(candidates.length).toBeGreaterThan(1);
    expect(signatures.size).toBe(candidates.length);
  });

  it("does not reuse cards across groups", () => {
    const hand = [
      card("w", "H", 6),
      card("s7", "S", 7),
      card("s8", "S", 8),
      card("s9", "S", 9),
      card("s10", "S", 10),
      card("a1", "C", 14),
      card("a2", "D", 14),
      card("a3", "H", 14),
      card("a4", "S", 14)
    ];

    const result = arrangeHandByPower(hand, 6, 0);
    const ids = result.cards.map((item) => item.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(hand.length);
    expect(uniqueIds.size).toBe(hand.length);
  });

  it("keeps same style when preferred style still exists after cards shrink", () => {
    const hand = [
      card("s10", "S", 10),
      card("s11", "S", 11),
      card("s12", "S", 12),
      card("s13", "S", 13),
      card("h2wild", "H", 2),
      card("c3", "C", 3),
      card("d5", "D", 5),
      card("h8", "H", 8)
    ];

    const initialCandidates = buildPowerArrangeCandidates(hand, 2, 12);
    const preferred = initialCandidates.find((candidate) => candidate.groups.some((group) => group.type === "straight_flush"));
    expect(preferred).toBeDefined();

    const preference = derivePowerPreference(preferred);
    const nextHand = hand.filter((item) => item.id !== "d5");
    const nextCandidates = buildPowerArrangeCandidates(nextHand, 2, 12);
    const picked = selectPowerCandidate(nextCandidates, preference);

    expect(picked.reason === "style" || picked.reason === "signature").toBe(true);
    expect(picked.candidate.groups.some((group) => group.type === "straight_flush")).toBe(true);
  });

  it("falls back to nearest overlap when preferred style disappears", () => {
    const previousCandidate = {
      cards: [card("a", "S", 9), card("b", "S", 10), card("c", "S", 11), card("d", "S", 12), card("e", "S", 13)],
      groups: [
        {
          type: "straight_flush" as const,
          cards: [card("a", "S", 9), card("b", "S", 10), card("c", "S", 11), card("d", "S", 12), card("e", "S", 13)],
          strength: 999,
          label: "同花顺"
        }
      ],
      score: 999,
      slots: [],
      signature: "a|b|c|d|e"
    };

    const candidates = [
      {
        cards: [card("x1", "C", 3), card("x2", "D", 3), card("x3", "H", 3), card("x4", "S", 3)],
        groups: [
          {
            type: "bomb" as const,
            cards: [card("x1", "C", 3), card("x2", "D", 3), card("x3", "H", 3), card("x4", "S", 3)],
            strength: 4000,
            label: "炸弹(4)"
          }
        ],
        score: 100,
        slots: [],
        signature: "x1|x2|x3|x4"
      },
      {
        cards: [card("a", "S", 9), card("b", "S", 10), card("y1", "C", 5), card("y2", "D", 5)],
        groups: [
          {
            type: "bomb" as const,
            cards: [card("y1", "C", 5), card("y2", "D", 5), card("z1", "H", 5), card("z2", "S", 5)],
            strength: 5000,
            label: "炸弹(4)"
          }
        ],
        score: 99,
        slots: [],
        signature: "a|b|y1|y2"
      }
    ];

    const preference = derivePowerPreference(previousCandidate);
    const picked = selectPowerCandidate(candidates, preference);

    expect(picked.reason).toBe("overlap");
    expect(picked.candidateIndex).toBe(1);
  });
});
