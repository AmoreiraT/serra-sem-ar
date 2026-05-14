import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall, onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {handleOxygenRecalculate} from "./http/oxygenRecalculate";
import {handlePerformanceProfile} from "./http/performanceProfile";
import {handlePresenceJoin} from "./http/presenceJoin";
import {handlePresenceLeave} from "./http/presenceLeave";
import {handlePresenceUpdate} from "./http/presenceUpdate";
import {aggregateOxygenScheduled} from "./scheduled/aggregateOxygen";
import {cleanupStalePresence} from "./scheduled/cleanupStalePresence";
import {applyCors, sendHttpError, type HttpRequest, type HttpResponse} from "./utils/http";

setGlobalOptions({region: "us-east1"});

initializeApp();
const db = getFirestore();

type CreateMemorialPayload = {
  date: string;
  dateIndex?: number | null;
  name?: string | null;
  message: string;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MESSAGE_LENGTH = 240;
const MAX_NAME_LENGTH = 64;
const MEMORIAL_ALLOWED_ORIGINS = [
  /^https:\/\/serrasemar\.web\.app$/,
  /^https:\/\/serrasemar\.firebaseapp\.com$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

export {aggregateOxygenScheduled, cleanupStalePresence};

const routePathForRequest = (request: HttpRequest): string => {
  const rawPath = request.path ?? new URL(request.url ?? "/", "https://serra-sem-ar.local").pathname;
  const withoutApiPrefix = rawPath.replace(/^\/api(?=\/|$)/, "");
  return withoutApiPrefix || "/";
};

export const api = onRequest(async (request, response) => {
  const httpRequest = request as HttpRequest;
  const httpResponse = response as HttpResponse;
  if (applyCors(httpRequest, httpResponse)) return;

  try {
    const routePath = routePathForRequest(httpRequest);
    if (routePath === "/presence/join") {
      await handlePresenceJoin(httpRequest, httpResponse);
      return;
    }
    if (routePath === "/presence/update") {
      await handlePresenceUpdate(httpRequest, httpResponse);
      return;
    }
    if (routePath === "/presence/leave") {
      await handlePresenceLeave(httpRequest, httpResponse);
      return;
    }
    if (routePath === "/oxygen/recalculate") {
      await handleOxygenRecalculate(httpRequest, httpResponse);
      return;
    }
    if (routePath === "/performance/profile") {
      handlePerformanceProfile(httpRequest, httpResponse);
      return;
    }

    response.status(404).json({error: "not_found"});
  } catch (error: unknown) {
    sendHttpError(httpResponse, error);
  }
});

export const createMemorial = onCall<CreateMemorialPayload>(
  {cors: MEMORIAL_ALLOWED_ORIGINS},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login requerido.");
    }

    const payload = request.data;
    if (!payload?.date || !DATE_REGEX.test(payload.date)) {
      throw new HttpsError("invalid-argument", "Data invalida.");
    }
    if (!payload?.message || !payload.message.trim()) {
      throw new HttpsError("invalid-argument", "Mensagem obrigatoria.");
    }
    if (payload.message.trim().length > MAX_MESSAGE_LENGTH) {
      throw new HttpsError("invalid-argument", "Mensagem muito longa.");
    }
    if (payload.name && payload.name.trim().length > MAX_NAME_LENGTH) {
      throw new HttpsError("invalid-argument", "Nome muito longo.");
    }

    const entry = {
      date: payload.date,
      dateIndex: Number.isFinite(payload.dateIndex) ? payload.dateIndex : null,
      name: payload.name?.trim() || null,
      message: payload.message.trim(),
      uid: request.auth.uid,
      userName: request.auth.token.name ?? null,
      userPhoto: request.auth.token.picture ?? null,
      createdAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("memorials").add(entry);
    return {id: docRef.id};
  }
);
