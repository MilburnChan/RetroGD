"use client";

import { canBeat, evaluateCombinationByRule } from "@retro/game-engine";
import type { Card, GameTableStateResponse, PlayerActionType } from "@retro/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ActionDock } from "@/src/components/table/ActionDock";
import { CollapsibleSidebar } from "@/src/components/table/CollapsibleSidebar";
import { NarrativeTopbar } from "@/src/components/table/NarrativeTopbar";
import { OnboardingCoach } from "@/src/components/table/OnboardingCoach";
import { TableBoard } from "@/src/components/table/TableBoard";
import {
  arrangeHand,
  buildPowerArrangeCandidates,
  derivePowerPreference,
  selectPowerCandidate,
  type HandArrangeMode,
  type PowerArrangePreference
} from "@/src/lib/hand-arranger";
import {
  MAX_AUTO_AI_RETRIES,
  canAutoAiRetry,
  computeAutoAiDelay,
  registerAutoAiFailure,
  type AutoAiRetryState
} from "@/src/lib/auto-ai-retry";

const roundModeLabel: Record<string, string> = {
  double_down: "双下",
  single_down: "单下",
  opponent: "对手局"
};

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
};

const normalizeRoomCodeInput = (value: string): string => {
  return value.trim().toUpperCase();
};

const COACH_DISABLE_KEY = "retro_coach_disabled";
const COACH_SEEN_KEY = "retro_coach_seen";

interface PendingPlay {
  cardIds: string[];
  expiresAt: number;
}

export default function GamePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId ?? "";

  const [payload, setPayload] = useState<GameTableStateResponse | null>(null);
  const [message, setMessage] = useState("");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dismissOrientationHint, setDismissOrientationHint] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [handArrangeMode, setHandArrangeMode] = useState<HandArrangeMode>("default");
  const [powerArrangeIndex, setPowerArrangeIndex] = useState(0);
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null);
  const [pendingNow, setPendingNow] = useState<number>(() => Date.now());
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachStepIndex, setCoachStepIndex] = useState(0);

  const lastAutoMoveSeqRef = useRef<number>(-1);
  const aiMoveInFlightRef = useRef(false);
  const autoAiRetryRef = useRef<Map<string, AutoAiRetryState>>(new Map());
  const viewerHandKeyRef = useRef<string>("");
  const roundNoRef = useRef<number | null>(null);
  const powerPreferenceRef = useRef<PowerArrangePreference | null>(null);
  const arrangeFallbackNoticeKeyRef = useRef<string>("");

  const loadState = useCallback(async (targetGameId: string) => {
    const res = await fetch(`/api/games/${targetGameId}/state`, { cache: "no-store" });
    const data = (await res.json()) as GameTableStateResponse & { error?: { message: string } };

    if (!res.ok || !data.game) {
      setMessage(data.error?.message ?? "对局状态加载失败");
      return;
    }

    setPayload(data);
  }, []);

  useEffect(() => {
    if (!gameId) return;

    loadState(gameId).catch(() => setMessage("对局状态加载失败"));
    const timer = setInterval(() => {
      loadState(gameId).catch(() => undefined);
    }, 1500);

    return () => clearInterval(timer);
  }, [gameId, loadState]);

  useEffect(() => {
    const update = (): void => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const viewerSourceSeat = useMemo(() => {
    return payload?.tableSeats.find((seat) => seat.isViewer) ?? null;
  }, [payload]);

  const viewerHandKey = useMemo(() => {
    if (!viewerSourceSeat) return "";
    return viewerSourceSeat.visibleCards
      .map((card) => card.id)
      .sort()
      .join("|");
  }, [viewerSourceSeat]);

  useEffect(() => {
    const roundNo = payload?.match.roundNo;
    if (roundNo === undefined) return;

    if (roundNoRef.current === null) {
      roundNoRef.current = roundNo;
      return;
    }

    if (roundNoRef.current !== roundNo) {
      roundNoRef.current = roundNo;
      powerPreferenceRef.current = null;
      arrangeFallbackNoticeKeyRef.current = "";
      if (handArrangeMode === "power") {
        setPowerArrangeIndex(0);
      }
    }
  }, [payload?.match.roundNo, handArrangeMode]);

  useEffect(() => {
    if (!viewerHandKey) return;

    const handChanged = viewerHandKeyRef.current !== viewerHandKey;
    if (!handChanged) return;

    viewerHandKeyRef.current = viewerHandKey;
    if (handArrangeMode !== "power" || !payload || !viewerSourceSeat) {
      return;
    }

    const candidates = buildPowerArrangeCandidates(viewerSourceSeat.visibleCards, payload.ruleMeta.levelRank);
    const previousPreference = powerPreferenceRef.current;
    const selection = selectPowerCandidate(candidates, previousPreference);

    if (selection.candidateIndex !== powerArrangeIndex) {
      setPowerArrangeIndex(selection.candidateIndex);
    }

    const hadStylePreference = Boolean(previousPreference?.styleKey);
    const lostStyle = hadStylePreference && selection.reason !== "signature" && selection.reason !== "style";
    if (lostStyle && arrangeFallbackNoticeKeyRef.current !== viewerHandKey) {
      setMessage("当前手牌已无法维持原强牌结构，已切换到最接近方案。");
      arrangeFallbackNoticeKeyRef.current = viewerHandKey;
    }

    powerPreferenceRef.current = derivePowerPreference(selection.candidate);
  }, [viewerHandKey, handArrangeMode, payload, viewerSourceSeat, powerArrangeIndex]);

  const arrangedViewer = useMemo(() => {
    if (!payload || !viewerSourceSeat) return null;
    return arrangeHand(viewerSourceSeat.visibleCards, handArrangeMode, payload.ruleMeta.levelRank, powerArrangeIndex);
  }, [payload, viewerSourceSeat, handArrangeMode, powerArrangeIndex]);

  useEffect(() => {
    if (handArrangeMode !== "power") return;
    if (!arrangedViewer?.candidate) return;
    powerPreferenceRef.current = derivePowerPreference(arrangedViewer.candidate);
  }, [arrangedViewer, handArrangeMode]);

  const powerCandidateCount = arrangedViewer?.candidateCount ?? 1;
  const powerCandidateDisplayIndex = arrangedViewer?.candidateIndex ?? 0;

  const tableSeats = useMemo(() => {
    if (!payload) return [];

    return payload.tableSeats.map((seat) => {
      if (!seat.isViewer || !arrangedViewer) return seat;
      return {
        ...seat,
        visibleCards: arrangedViewer.cards
      };
    });
  }, [payload, arrangedViewer]);

  const selectedCardSet = useMemo(() => new Set(selectedCardIds), [selectedCardIds]);
  const mySeat = useMemo(() => tableSeats.find((seat) => seat.isViewer) ?? null, [tableSeats]);
  const currentSeat = useMemo(() => tableSeats.find((seat) => seat.isCurrentTurn) ?? null, [tableSeats]);
  const autoGameId = payload?.game.id ?? null;
  const autoActionSeq = payload?.game.actionSeq ?? null;
  const aiTurnSeatId = payload?.tableSeats.find((seat) => seat.isCurrentTurn && seat.isAi && !seat.isViewer)?.playerId ?? null;
  const aiAutoMoveKey = payload ? `${payload.game.id}:${payload.game.actionSeq}:${aiTurnSeatId ?? "none"}` : null;

  const playerNameById = useMemo(() => {
    const pairs = tableSeats
      .filter((seat) => Boolean(seat.playerId))
      .map((seat) => [seat.playerId as string, seat.nickname] as const);

    return Object.fromEntries(pairs);
  }, [tableSeats]);

  const currentPlayerName = currentSeat?.nickname ?? currentSeat?.playerId ?? "-";

  const myPendingAction = useMemo(() => {
    if (!payload || !mySeat?.playerId) return null;
    return payload.pendingActions.find((action) => action.playerId === mySeat.playerId) ?? null;
  }, [payload, mySeat]);

  const spectatorMode = payload ? payload.viewerSeatIndex === null || payload.viewerPlayerId === null : false;
  const myTurn = Boolean(mySeat?.isCurrentTurn && payload?.game.phase === "turns");
  const tributeWaiting = payload?.game.phase === "tribute";

  const selectedCards = useMemo(() => {
    if (!mySeat) return [] as Card[];
    const map = new Map(mySeat.visibleCards.map((card) => [card.id, card]));
    return selectedCardIds.map((id) => map.get(id)).filter((card): card is Card => Boolean(card));
  }, [mySeat, selectedCardIds]);

  const localSelectionHint = useMemo(() => {
    if (!payload) {
      return {
        valid: false,
        reason: "对局加载中",
        previewComboType: null
      };
    }

    if (spectatorMode) {
      return {
        valid: false,
        reason: "观战态不可操作",
        previewComboType: null
      };
    }

    if (selectedCards.length === 0) {
      return {
        valid: false,
        reason: "请选择牌",
        previewComboType: null
      };
    }

    if (myPendingAction?.action === "tribute_give" || myPendingAction?.action === "tribute_return") {
      if (selectedCards.length !== 1) {
        return {
          valid: false,
          reason: "贡牌/还贡需要选择 1 张牌",
          previewComboType: null
        };
      }

      return {
        valid: true,
        reason: null,
        previewComboType: myPendingAction.action
      };
    }

    if (!myTurn) {
      return {
        valid: false,
        reason: "当前未轮到你",
        previewComboType: null
      };
    }

    const combo = evaluateCombinationByRule(selectedCards, {
      levelRank: payload.ruleMeta.levelRank,
      wildcardEnabled: payload.ruleMeta.wildcard.enabled
    });

    if (combo.type === "invalid") {
      return {
        valid: false,
        reason: "牌型不成立",
        previewComboType: null
      };
    }

    const lastPlay = payload.game.lastPlay;
    if (lastPlay && mySeat?.playerId !== lastPlay.playerId && !canBeat(combo, lastPlay.combo)) {
      return {
        valid: false,
        reason: "未大过上手",
        previewComboType: combo.type
      };
    }

    return {
      valid: true,
      reason: null,
      previewComboType: combo.type
    };
  }, [payload, spectatorMode, selectedCards, myPendingAction, myTurn, mySeat]);

  const selectionHint = localSelectionHint;

  const clearSelection = () => {
    setSelectedCardIds([]);
  };

  const toggleCard = (cardId: string) => {
    if (pendingPlay) return;
    if (!mySeat) return;

    const exists = mySeat.visibleCards.some((card) => card.id === cardId);
    if (!exists) return;

    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  };

  const submitAction = useCallback(
    async (type: PlayerActionType, cardIdsOverride?: string[]) => {
      if (!payload) return;
      if (spectatorMode) {
        setMessage("当前为观战态，返回房间重新加入后可操作。");
        return;
      }

      const cardIds = cardIdsOverride ?? selectedCardIds;
      const requiresCard = type === "play" || type === "tribute_give" || type === "tribute_return";
      if (requiresCard && cardIds.length === 0) {
        setMessage("请先选择牌");
        return;
      }

      if ((type === "tribute_give" || type === "tribute_return") && cardIds.length !== 1) {
        setMessage("贡牌/还贡必须选择 1 张牌");
        return;
      }

      setLoadingAction(true);
      setMessage("");

      try {
        const body =
          type === "pass" || type === "toggle_auto"
            ? { type }
            : {
                type,
                cardIds
              };

        const res = await fetch(`/api/games/${payload.game.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        const data = (await res.json()) as { error?: { message: string } };
        if (!res.ok) {
          setMessage(data.error?.message ?? "动作提交失败");
          return;
        }

        setSelectedCardIds([]);
        setPendingPlay(null);
        await loadState(payload.game.id);
      } finally {
        setLoadingAction(false);
      }
    },
    [payload, spectatorMode, selectedCardIds, loadState]
  );

  const triggerAiMove = useCallback(
    async (targetGameId: string): Promise<{ ok: boolean; errorMessage?: string }> => {
      const res = await fetch(`/api/games/${targetGameId}/ai-move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty: "normal" })
      });

      const data = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        return {
          ok: false,
          errorMessage: data.error?.message ?? "AI 出牌失败"
        };
      }

      await loadState(targetGameId);
      return { ok: true };
    },
    [loadState]
  );

  useEffect(() => {
    if (!autoGameId || autoActionSeq === null) {
      return;
    }

    if (!aiTurnSeatId) return;
    if (aiMoveInFlightRef.current) return;

    const retryKey = `${autoGameId}:${autoActionSeq}`;
    const retryState = autoAiRetryRef.current.get(retryKey);

    if (lastAutoMoveSeqRef.current === autoActionSeq && !retryState) {
      return;
    }

    if (!canAutoAiRetry(retryState, Date.now())) {
      if ((retryState?.attempts ?? 0) >= MAX_AUTO_AI_RETRIES) {
        setMessage("AI 连续出牌失败，请点击“调试触发 AI”重试。");
      }
      return;
    }

    let cancelled = false;

    const run = async (state: AutoAiRetryState | undefined): Promise<void> => {
      const now = Date.now();
      if (state && state.nextRetryAt > now) {
        await sleep(state.nextRetryAt - now);
      }

      const delay = state ? computeAutoAiDelay(state.attempts) : 800 + Math.floor(Math.random() * 401);
      await sleep(delay);

      if (cancelled) return;

      aiMoveInFlightRef.current = true;
      const result = await triggerAiMove(autoGameId);
      aiMoveInFlightRef.current = false;

      if (cancelled) return;

      if (result.ok) {
        autoAiRetryRef.current.delete(retryKey);
        lastAutoMoveSeqRef.current = autoActionSeq;
        return;
      }

      const nextState = registerAutoAiFailure(state, Date.now(), result.errorMessage ?? "AI 出牌失败");
      autoAiRetryRef.current.set(retryKey, nextState);

      if (nextState.attempts >= MAX_AUTO_AI_RETRIES) {
        setMessage("AI 连续出牌失败，请点击“调试触发 AI”重试。");
        return;
      }

      setMessage(`${nextState.lastError ?? "AI 出牌失败"}，自动重试 ${nextState.attempts}/${MAX_AUTO_AI_RETRIES}`);
      await run(nextState);
    };

    void run(retryState);

    return () => {
      cancelled = true;
    };
  }, [aiAutoMoveKey, aiTurnSeatId, autoGameId, autoActionSeq, triggerAiMove]);

  useEffect(() => {
    if (spectatorMode && selectedCardIds.length > 0) {
      setSelectedCardIds([]);
    }
  }, [selectedCardIds.length, spectatorMode]);

  useEffect(() => {
    if (!pendingPlay) return;
    const timer = window.setInterval(() => setPendingNow(Date.now()), 80);
    return () => window.clearInterval(timer);
  }, [pendingPlay]);

  useEffect(() => {
    if (!pendingPlay) return;
    const delay = Math.max(0, pendingPlay.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      void submitAction("play", pendingPlay.cardIds);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [pendingPlay, submitAction]);

  useEffect(() => {
    if (!payload) return;
    const disabled = window.localStorage.getItem(COACH_DISABLE_KEY) === "1";
    const seen = window.localStorage.getItem(COACH_SEEN_KEY) === "1";
    if (disabled || seen) return;

    if (payload.match.roundNo <= 1) {
      setCoachOpen(true);
    }
  }, [payload]);

  if (!payload) {
    return (
      <main className="table-shell">
        <div className="pixel-panel table-loading">正在加载牌桌...</div>
      </main>
    );
  }

  const showDevAiButton = process.env.NODE_ENV !== "production";
  const pendingPlayMs = pendingPlay ? Math.max(0, pendingPlay.expiresAt - pendingNow) : null;
  const roundSummary = payload.match.lastRoundResult
    ? `上局 Team ${payload.match.lastRoundResult.winnerTeam} ${roundModeLabel[payload.match.lastRoundResult.mode] ?? payload.match.lastRoundResult.mode}，升级 +${payload.match.lastRoundResult.upgradeDelta}`
    : null;

  return (
    <main className="table-shell">
      {isPortrait && !dismissOrientationHint ? (
        <section className="orientation-banner pixel-panel">
          <p>建议横屏体验，当前牌桌信息较密集。</p>
          <button type="button" className="pixel-btn secondary" onClick={() => setDismissOrientationHint(true)}>
            继续竖屏
          </button>
        </section>
      ) : null}

      <NarrativeTopbar
        roomCode={normalizeRoomCodeInput(payload.room.roomCode)}
        phase={payload.game.phase}
        actionSeq={payload.game.actionSeq}
        roundNo={payload.match.roundNo}
        levelRank={payload.ruleMeta.levelRank}
        wildcardEnabled={payload.ruleMeta.wildcard.enabled}
        spectatorMode={spectatorMode}
        narrativeLine={payload.uiHints.narrativeLine}
        currentPlayerName={currentPlayerName}
        roundSummary={roundSummary}
        onBackRoom={() => window.location.assign(`/rooms/${payload.room.roomId}`)}
        onOpenReview={() => window.location.assign(`/games/${payload.game.id}/review`)}
        onDebugAi={
          showDevAiButton
            ? () => {
                void triggerAiMove(payload.game.id);
              }
            : undefined
        }
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onOpenCoach={() => {
          const disabled = window.localStorage.getItem(COACH_DISABLE_KEY) === "1";
          if (disabled) return;
          setCoachStepIndex(0);
          setCoachOpen(true);
        }}
      />

      <section className="table-main-wrap">
        <TableBoard
          seats={tableSeats}
          lastPlay={payload.game.lastPlay}
          phase={payload.game.phase}
          currentPlayerName={currentPlayerName}
          selectedCardIds={selectedCardSet}
          onToggleCard={toggleCard}
          canInteractCards={!loadingAction && (myTurn || Boolean(myPendingAction)) && !pendingPlay}
          turnDeadlineMs={payload.uiHints.turnDeadlineMs}
          selectionHint={selectionHint}
        />

        <CollapsibleSidebar
          open={sidebarOpen}
          logs={payload.logs}
          finishedOrder={payload.game.finishedOrder}
          winnerTeam={payload.game.winnerTeam}
          playerNameById={playerNameById}
        />
      </section>

      <ActionDock
        spectatorMode={spectatorMode}
        loadingAction={loadingAction}
        myTurn={myTurn}
        tributeWaiting={tributeWaiting}
        pendingAction={myPendingAction}
        selectedCount={selectedCardIds.length}
        selectionHint={selectionHint}
        pendingPlayMs={pendingPlayMs}
        handArrangeMode={handArrangeMode}
        powerCandidateIndex={powerCandidateDisplayIndex}
        powerCandidateCount={powerCandidateCount}
        onConfirmPlay={() => {
          if (!selectionHint.valid) {
            setMessage(selectionHint.reason ?? "当前选择不可出牌");
            return;
          }

          setMessage("");
          setPendingPlay({
            cardIds: [...selectedCardIds],
            expiresAt: Date.now() + 1200
          });
        }}
        onUndoPendingPlay={() => {
          setPendingPlay(null);
        }}
        onPass={() => {
          void submitAction("pass");
        }}
        onClearSelection={clearSelection}
        onTogglePowerArrange={() => {
          if (handArrangeMode !== "power") {
            powerPreferenceRef.current = null;
            arrangeFallbackNoticeKeyRef.current = "";
            setHandArrangeMode("power");
            setPowerArrangeIndex(0);
            return;
          }

          if (powerCandidateCount <= 1) {
            setMessage("仅有 1 种强牌组合");
            return;
          }

          setPowerArrangeIndex((prev) => (prev + 1) % powerCandidateCount);
        }}
        onResetArrange={() => {
          powerPreferenceRef.current = null;
          arrangeFallbackNoticeKeyRef.current = "";
          setHandArrangeMode("default");
          setPowerArrangeIndex(0);
        }}
        onTributeGive={() => {
          void submitAction("tribute_give");
        }}
        onTributeReturn={() => {
          void submitAction("tribute_return");
        }}
      />

      {message ? <p className="pixel-panel table-message">{message}</p> : null}

      <OnboardingCoach
        open={coachOpen}
        stepIndex={coachStepIndex}
        onNext={() => setCoachStepIndex((prev) => Math.min(prev + 1, 2))}
        onClose={() => {
          setCoachOpen(false);
          setCoachStepIndex(0);
          window.localStorage.setItem(COACH_SEEN_KEY, "1");
        }}
        onDisablePermanently={() => {
          setCoachOpen(false);
          setCoachStepIndex(0);
          window.localStorage.setItem(COACH_DISABLE_KEY, "1");
        }}
      />
    </main>
  );
}
