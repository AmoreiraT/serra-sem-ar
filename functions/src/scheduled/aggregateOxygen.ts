import {onSchedule} from "firebase-functions/v2/scheduler";
import {aggregateOxygenFromPresence} from "../services/oxygen.service";
import {cleanupStalePresenceRecords} from "../services/presence.service";

export const aggregateOxygenScheduled = onSchedule(
  {schedule: "every 1 minutes"},
  async () => {
    const removedStaleSessions = await cleanupStalePresenceRecords();
    const result = await aggregateOxygenFromPresence();

    console.log("aggregateOxygenScheduled", {
      removedStaleSessions,
      onlineUsersCount: result.onlineUsersCount,
      collectiveOxygen: result.collectiveOxygen,
      pressure: result.pressure,
      collapsed: result.collapsed,
    });
  }
);
