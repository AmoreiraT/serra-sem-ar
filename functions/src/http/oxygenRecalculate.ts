import {recalculateOxygen} from "../services/oxygen.service";
import {requirePost, type HttpRequest, type HttpResponse} from "../utils/http";
import {validateRecalculateOxygenRequest} from "../utils/validation";

export const handleOxygenRecalculate = async (
  request: HttpRequest,
  response: HttpResponse
): Promise<void> => {
  requirePost(request);
  const payload = validateRecalculateOxygenRequest(request.body);
  const result = await recalculateOxygen(payload);
  response.status(200).json(result);
};

