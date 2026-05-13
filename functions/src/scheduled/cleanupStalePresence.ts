import {onSchedule} from "firebase-functions/v2/scheduler";
import {cleanupStalePresenceRecords} from "../services/presence.service";

export const cleanupStalePresence = onSchedule({schedule: "every 5 minutes"}, async () => {
  const result = await cleanupStalePresenceRecords(Date.now(), {includePresenceRooms: true});
  console.log("cleanupStalePresence", result);
});
