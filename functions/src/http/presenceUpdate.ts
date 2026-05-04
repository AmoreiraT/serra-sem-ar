import {updatePresence} from "../services/presence.service";
import {requirePost, type HttpRequest, type HttpResponse} from "../utils/http";
import {validateUpdatePresenceRequest} from "../utils/validation";

export const handlePresenceUpdate = async (
  request: HttpRequest,
  response: HttpResponse
): Promise<void> => {
  requirePost(request);
  const payload = validateUpdatePresenceRequest(request.body);
  const result = await updatePresence(payload);
  response.status(200).json(result);
};

