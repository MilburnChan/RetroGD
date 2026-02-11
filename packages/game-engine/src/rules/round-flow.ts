import type { Card, GameState, MatchState, RoundResult, RoundResultMode, TributeState } from "@retro/shared";

const MAX_LEVEL_RANK = 14;

export const teamForSeatIndex = (seatIndex: number): number => (seatIndex % 2 === 0 ? 0 : 1);

export const teamForPlayerId = (state: GameState, playerId: string): number | null => {
  const idx = state.playerOrder.indexOf(playerId);
  if (idx < 0) return null;
  return teamForSeatIndex(idx);
};

export const resolveWinnerTeamByRound = (state: GameState): number | null => {
  const teamFinished: Record<0 | 1, number> = { 0: 0, 1: 0 };

  for (const playerId of state.finishedOrder) {
    const team = teamForPlayerId(state, playerId);
    if (team === null) continue;
    teamFinished[team as 0 | 1] += 1;
  }

  if (teamFinished[0] >= 2) return 0;
  if (teamFinished[1] >= 2) return 1;

  // Fallback for end-state where cards are exhausted without explicit finish marks.
  for (let team = 0; team <= 1; team += 1) {
    const players = state.playerOrder.filter((_, index) => teamForSeatIndex(index) === team);
    if (players.every((playerId) => (state.hands[playerId]?.length ?? 0) === 0)) {
      return team;
    }
  }

  return null;
};

const rankModeBySecondWinnerPosition = (secondWinnerPos: number): RoundResultMode => {
  if (secondWinnerPos <= 2) return "double_down";
  if (secondWinnerPos === 3) return "single_down";
  return "opponent";
};

const deltaByMode = (mode: RoundResultMode): number => {
  if (mode === "double_down") return 3;
  if (mode === "single_down") return 2;
  return 1;
};

export const settleRoundResult = (state: GameState, winnerTeam: number): RoundResult => {
  const winnerPlayers = state.playerOrder.filter((playerId, index) => teamForSeatIndex(index) === winnerTeam);
  const winnerRanks = winnerPlayers
    .map((playerId) => state.finishedOrder.indexOf(playerId) + 1)
    .filter((rank) => rank > 0)
    .sort((a, b) => a - b);

  const secondWinnerPos = winnerRanks[1] ?? 4;
  const mode = rankModeBySecondWinnerPosition(secondWinnerPos);

  return {
    winnerTeam,
    mode,
    finishOrder: [...state.finishedOrder],
    upgradeDelta: deltaByMode(mode)
  };
};

export const applyLevelUpgrade = (match: MatchState, result: RoundResult): MatchState => {
  const teamLevel = { ...match.teamLevel };

  if (result.winnerTeam === 0) {
    teamLevel.team0 = Math.min(MAX_LEVEL_RANK, teamLevel.team0 + result.upgradeDelta);
  } else {
    teamLevel.team1 = Math.min(MAX_LEVEL_RANK, teamLevel.team1 + result.upgradeDelta);
  }

  return {
    ...match,
    teamLevel,
    lastRoundResult: result
  };
};

const hasRank = (cards: Card[], rank: number): boolean => cards.some((card) => card.rank === rank);

export const hasDoubleJokers = (cards: Card[]): boolean => {
  return hasRank(cards, 16) && hasRank(cards, 17);
};

export const pickMaxCard = (cards: Card[]): Card | null => {
  if (cards.length === 0) return null;

  const rankPower = (rank: number): number => {
    if (rank === 2) return 15;
    return rank;
  };

  return [...cards].sort((a, b) => {
    const byRank = rankPower(b.rank) - rankPower(a.rank);
    if (byRank !== 0) return byRank;
    return b.id.localeCompare(a.id);
  })[0] as Card;
};

export const resolveTributeParticipants = (
  state: GameState,
  winnerTeam: number
): { donorPlayerId: string; receiverPlayerId: string } | null => {
  const receiver = state.finishedOrder.find((playerId) => teamForPlayerId(state, playerId) === winnerTeam) ?? null;
  if (!receiver) return null;

  const loserTeam = winnerTeam === 0 ? 1 : 0;
  const loserPlayers = state.playerOrder.filter((playerId) => teamForPlayerId(state, playerId) === loserTeam);
  if (loserPlayers.length !== 2) return null;

  const donor = loserPlayers
    .map((playerId) => ({ playerId, count: state.hands[playerId]?.length ?? 0 }))
    .sort((a, b) => b.count - a.count || a.playerId.localeCompare(b.playerId))[0]?.playerId;

  if (!donor) return null;

  return {
    donorPlayerId: donor,
    receiverPlayerId: receiver
  };
};

export const buildPendingTribute = (
  donorPlayerId: string,
  receiverPlayerId: string
): TributeState => {
  return {
    donorPlayerId,
    receiverPlayerId,
    status: "pending_give"
  };
};

export const nextLevelRankByWinner = (match: MatchState, winnerTeam: number): number => {
  return winnerTeam === 0 ? match.teamLevel.team0 : match.teamLevel.team1;
};
