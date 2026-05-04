import {leavePresence} from "../services/presence.service";
import {requirePost, type HttpRequest, type HttpResponse} from "../utils/http";
import {validateLeavePresenceRequest} from "../utils/validation";

export const handlePresenceLeave = async (
  request: HttpRequest,
  response: HttpResponse
): Promise<void> => {
  requirePost(request);
  const payload = validateLeavePresenceRequest(request.body);
  const result = await leavePresence(payload.sessionId);
  response.status(200).json(result);
};

