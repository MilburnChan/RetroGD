import type { Card } from "@retro/shared";

const SUITS = ["S", "H", "C", "D"] as const;
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

const rankLabel = (rank: number): string => {
  if (rank <= 10) return String(rank);
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  if (rank === 16) return "BJ";
  if (rank === 17) return "RJ";
  return String(rank);
};

export const rankPower = (rank: number): number => {
  if (rank === 2) return 15;
  return rank;
};

export const sortCardsAsc = (cards: Card[]): Card[] => {
  return [...cards].sort((a, b) => {
    const diff = rankPower(a.rank) - rankPower(b.rank);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
};

export const createDoubleDeck = (): Card[] => {
  const cards: Card[] = [];
  for (let deck = 0; deck < 2; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `d${deck}-${suit}-${rank}-${cards.length}`,
          suit,
          rank,
          display: `${suit}${rankLabel(rank)}`
        });
      }
    }

    cards.push({
      id: `d${deck}-BJ-${cards.length}`,
      suit: "BJ",
      rank: 16,
      display: "BJ"
    });
    cards.push({
      id: `d${deck}-RJ-${cards.length}`,
      suit: "RJ",
      rank: 17,
      display: "RJ"
    });
  }

  return cards;
};

export const shuffleCards = (cards: Card[], rng: () => number = Math.random): Card[] => {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j] as Card;
    arr[j] = tmp as Card;
  }
  return arr;
};

export const dealToFourPlayers = (deck: Card[]): Card[][] => {
  if (deck.length !== 108) {
    throw new Error(`Double deck must contain 108 cards, got ${deck.length}`);
  }

  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < deck.length; i += 1) {
    hands[i % 4]?.push(deck[i] as Card);
  }
  return hands.map(sortCardsAsc);
};
