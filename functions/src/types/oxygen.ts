export type OxygenStatus = "stable" | "critical" | "collapsed";

export type CollapseReason =
  | "collective_oxygen_below_zero"
  | "too_many_users"
  | "stale_presence_cleanup";

export type ResetReason = "asphyxiated" | "presence_removed" | "stale_session";

export type OxygenConfig = {
  baseDrain: number;
  casesWeight: number;
  deathsWeight: number;
  crowdWeight: number;
  mobileDrainMultiplier: number;
  criticalThreshold: number;
  collapseThreshold: number;
  maxOnlineUsersSoftLimit: number;
};

export type WorldOxygenCollapse = {
  eventId: string;
  targetSessionId: string;
  createdAt: number;
  message: string;
};

export type WorldOxygenState = {
  updatedAt: number;
  onlineUsersCount: number;
  collectiveOxygen: number;
  currentDayIndex: number;
  normalizedCases: number;
  normalizedDeaths: number;
  pressure: number;
  status: OxygenStatus;
  lastCollapse?: WorldOxygenCollapse | null;
};

export type RecalculateOxygenRequest = {
  dayIndex: number;
  cases: number;
  deaths: number;
};

export type RecalculateOxygenResponse = {
  onlineUsersCount: number;
  collectiveOxygen: number;
  pressure: number;
  collapsed: boolean;
  collapsedSessionId?: string;
};
