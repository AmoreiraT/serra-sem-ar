import {getPerformanceProfile} from "../services/performanceProfile.service";
import {requireGet, type HttpRequest, type HttpResponse} from "../utils/http";

const deviceParamForRequest = (request: HttpRequest): string | null => {
  const url = new URL(request.url ?? "/", "https://serra-sem-ar.local");
  return url.searchParams.get("device");
};

export const handlePerformanceProfile = (
  request: HttpRequest,
  response: HttpResponse
): void => {
  requireGet(request);
  response.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  response.status(200).json(getPerformanceProfile(deviceParamForRequest(request)));
};
