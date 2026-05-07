import {randomUUID} from "crypto";
import {getDatabase} from "firebase-admin/database";
import type {
  CollapseReason,
  RecalculateOxygenRequest,
  RecalculateOxygenResponse,
  WorldOxygenState,
} from "../types/oxygen";
import type {CollapseEvent, RealtimePresence} from "../types/presence";
import {clamp} from "../utils/clamp";
import {parseWorldOxygenState} from "../utils/validation";
import {
  findOldestAlivePresence,
  listAlivePresences,
  markPresenceAsphyxiated,
} from "./presence.service";
import {
  createOxygenMemorial,
  recordDailyCollapse,
  recordPeakOnlineUsers,
} from "./memorial.service";
import {oxygenConfig} from "./oxygen.config";

export {oxygenConfig};

const WORLD_OXYGEN_PATH = "worldState/oxygen";
const COLLAPSE_EVENTS_PATH = "collapseEvents";
const MAX_CASES_NORMALIZER = 300_000;
const MAX_DEATHS_NORMALIZER = 5_000;
const RECALCULATE_MIN_INTERVAL_MS = 5_000;

const database = () => getDatabase();

export const defaultWorldOxygenState = (): WorldOxygenState => ({
  updatedAt: 0,
  onlineUsersCount: 0,
  collectiveOxygen: 100,
  currentDayIndex: 0,
  normalizedCases: 0,
  normalizedDeaths: 0,
  pressure: oxygenConfig.baseDrain,
  status: "stable",
  lastCollapse: null,
});

export const getWorldOxygenState = async (): Promise<WorldOxygenState> => {
  const snapshot = await database().ref(WORLD_OXYGEN_PATH).get();
  return parseWorldOxygenState(snapshot.val()) ?? defaultWorldOxygenState();
};

const worldStatusForOxygen = (collectiveOxygen: number): WorldOxygenState["status"] => {
  if (collectiveOxygen <= oxygenConfig.collapseThreshold) return "collapsed";
  if (collectiveOxygen <= oxygenConfig.criticalThreshold) return "critical";
  return "stable";
};

const calculatePandemicPressure = (
  normalizedCases: number,
  normalizedDeaths: number,
  onlineUsersCount: number
): number => {
  const crowdPressure = onlineUsersCount * oxygenConfig.crowdWeight;
  const overflowUsers = Math.max(0, onlineUsersCount - oxygenConfig.maxOnlineUsersSoftLimit);
  const overflowPressure = overflowUsers * oxygenConfig.crowdWeight * 1.85;

  return (
    oxygenConfig.baseDrain +
    normalizedCases * oxygenConfig.casesWeight +
    normalizedDeaths * oxygenConfig.deathsWeight +
    crowdPressure +
    overflowPressure
  );
};

const buildWorldState = (
  input: RecalculateOxygenRequest,
  onlineUsersCount: number,
  now: number
): WorldOxygenState => {
  const normalizedCases = clamp(input.cases / MAX_CASES_NORMALIZER, 0, 1);
  const normalizedDeaths = clamp(input.deaths / MAX_DEATHS_NORMALIZER, 0, 1);
  const pressure = calculatePandemicPressure(normalizedCases, normalizedDeaths, onlineUsersCount);
  const collectiveOxygen = 100 - pressure;

  return {
    updatedAt: now,
    onlineUsersCount,
    collectiveOxygen,
    currentDayIndex: input.dayIndex,
    normalizedCases,
    normalizedDeaths,
    pressure,
    status: worldStatusForOxygen(collectiveOxygen),
  };
};

const medianNumber = (values: number[]): number => {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

const oldestPresenceFrom = (presences: RealtimePresence[]): RealtimePresence | null => {
  if (!presences.length) return null;
  return presences.reduce((oldest, presence) =>
    presence.joinedAt < oldest.joinedAt ? presence : oldest
  );
};

const recordPeakOnlineUsersSafe = async (onlineUsersCount: number): Promise<void> => {
  await recordPeakOnlineUsers(onlineUsersCount).catch((error: unknown) => {
    console.warn(
      "recordPeakOnlineUsers failed",
      error instanceof Error ? error.message : "unknown_error"
    );
  });
};

const collapseMessage = (reason: CollapseReason): string => {
  if (reason === "too_many_users") {
    return "Presencas demais comprimiram o ar. A serra guardou uma ausencia.";
  }

  if (reason === "stale_presence_cleanup") {
    return "Uma presenca se perdeu da rede e foi retirada em silencio.";
  }

  return "A serra ficou sem ar. Um corpo a menos no grafico.";
};

const createCollapseEvent = async (
  targetSessionId: string,
  reason: CollapseReason,
  input: RecalculateOxygenRequest,
  now: number,
  message: string
): Promise<CollapseEvent> => {
  const eventId = `collapse_${randomUUID()}`;
  const event: CollapseEvent = {
    eventId,
    targetSessionId,
    reason,
    dayIndex: input.dayIndex,
    cases: input.cases,
    deaths: input.deaths,
    createdAt: now,
    message,
  };

  await database().ref(`${COLLAPSE_EVENTS_PATH}/${eventId}`).set(event);
  return event;
};

const writeWorldState = async (state: WorldOxygenState): Promise<void> => {
  await database().ref(WORLD_OXYGEN_PATH).set(state);
};

const completeOxygenCalculation = async (
  input: RecalculateOxygenRequest,
  alivePresences: RealtimePresence[],
  now: number,
  shouldRecordPeak: boolean
): Promise<RecalculateOxygenResponse> => {
  const onlineUsersCount = alivePresences.length;
  const calculatedWorld = buildWorldState(input, onlineUsersCount, now);

  if (shouldRecordPeak) {
    await recordPeakOnlineUsersSafe(onlineUsersCount);
  }

  if (calculatedWorld.collectiveOxygen > oxygenConfig.collapseThreshold ||
    onlineUsersCount === 0) {
    await writeWorldState(calculatedWorld);
    return {
      onlineUsersCount,
      collectiveOxygen: calculatedWorld.collectiveOxygen,
      pressure: calculatedWorld.pressure,
      collapsed: false,
    };
  }

  const oldest = oldestPresenceFrom(alivePresences) ??
    await findOldestAlivePresence(now);
  if (!oldest) {
    await writeWorldState(calculatedWorld);
    return {
      onlineUsersCount,
      collectiveOxygen: calculatedWorld.collectiveOxygen,
      pressure: calculatedWorld.pressure,
      collapsed: false,
    };
  }

  const reason: CollapseReason =
    onlineUsersCount > oxygenConfig.maxOnlineUsersSoftLimit ?
      "too_many_users" :
      "collective_oxygen_below_zero";
  const message = collapseMessage(reason);

  await markPresenceAsphyxiated(oldest, now);
  const collapseEvent = await createCollapseEvent(oldest.sessionId, reason, input, now, message);
  await createOxygenMemorial({
    sessionId: oldest.sessionId,
    dayIndex: input.dayIndex,
    position: oldest.position,
    cases: input.cases,
    deaths: input.deaths,
    message,
    type: reason === "too_many_users" ? "presence_removed" : "oxygen_collapse",
  });
  await recordDailyCollapse().catch((error: unknown) => {
    console.warn("recordDailyCollapse failed", error instanceof Error ? error.message : "unknown_error");
  });

  const recalibratedWorld: WorldOxygenState = {
    ...buildWorldState(input, Math.max(0, onlineUsersCount - 1), now),
    lastCollapse: {
      eventId: collapseEvent.eventId,
      targetSessionId: collapseEvent.targetSessionId,
      createdAt: collapseEvent.createdAt,
      message: collapseEvent.message,
    },
  };
  await writeWorldState(recalibratedWorld);

  return {
    onlineUsersCount: recalibratedWorld.onlineUsersCount,
    collectiveOxygen: recalibratedWorld.collectiveOxygen,
    pressure: recalibratedWorld.pressure,
    collapsed: true,
    collapsedSessionId: oldest.sessionId,
  };
};

export const recalculateOxygen = async (
  input: RecalculateOxygenRequest
): Promise<RecalculateOxygenResponse> => {
  const now = Date.now();
  const currentWorld = await getWorldOxygenState();

  if (
    currentWorld.currentDayIndex === input.dayIndex &&
    now - currentWorld.updatedAt < RECALCULATE_MIN_INTERVAL_MS
  ) {
    return {
      onlineUsersCount: currentWorld.onlineUsersCount,
      collectiveOxygen: currentWorld.collectiveOxygen,
      pressure: currentWorld.pressure,
      collapsed: false,
    };
  }

  const alivePresences = await listAlivePresences(now);
  return completeOxygenCalculation(input, alivePresences, now, false);
};

export const aggregateOxygenFromPresence = async (
  now = Date.now()
): Promise<RecalculateOxygenResponse> => {
  const alivePresences = await listAlivePresences(now);

  if (!alivePresences.length) {
    const currentWorld = await getWorldOxygenState();
    const emptyWorld: WorldOxygenState = {
      ...defaultWorldOxygenState(),
      updatedAt: now,
      currentDayIndex: currentWorld.currentDayIndex,
    };
    await writeWorldState(emptyWorld);
    return {
      onlineUsersCount: 0,
      collectiveOxygen: emptyWorld.collectiveOxygen,
      pressure: emptyWorld.pressure,
      collapsed: false,
    };
  }

  const cases = medianNumber(alivePresences.map((presence) => presence.cases ?? 0));
  const deaths = medianNumber(alivePresences.map((presence) => presence.deaths ?? 0));
  const dayIndex = Math.round(medianNumber(alivePresences.map((presence) => presence.dayIndex)));

  return completeOxygenCalculation(
    {dayIndex, cases, deaths},
    alivePresences,
    now,
    true
  );
};
