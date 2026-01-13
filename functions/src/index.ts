import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";

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

export const createMemorial = onCall<CreateMemorialPayload>(async (request) => {
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
});
