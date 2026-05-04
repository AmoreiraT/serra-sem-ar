import {joinPresence} from "../services/presence.service";
import {requirePost, type HttpRequest, type HttpResponse} from "../utils/http";
import {validateJoinPresenceRequest} from "../utils/validation";

export const handlePresenceJoin = async (
  request: HttpRequest,
  response: HttpResponse
): Promise<void> => {
  requirePost(request);
  const payload = validateJoinPresenceRequest(request.body);
  const result = await joinPresence(payload);
  response.status(200).json(result);
};

