import {onSchedule} from "firebase-functions/v2/scheduler";
import {cleanupStalePresenceRecords} from "../services/presence.service";

export const cleanupStalePresence = onSchedule({schedule: "every 5 minutes"}, async () => {
  const removed = await cleanupStalePresenceRecords();
  console.log("cleanupStalePresence", {removed});
});

