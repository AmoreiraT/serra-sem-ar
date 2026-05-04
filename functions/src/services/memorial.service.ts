import {FieldValue, getFirestore} from "firebase-admin/firestore";
import type {PresenceVector} from "../types/presence";
import {isRecord} from "../utils/validation";

export type OxygenMemorialInput = {
  sessionId: string;
  dayIndex: number;
  position: PresenceVector;
  cases: number;
  deaths: number;
  message: string;
  type: "oxygen_collapse" | "presence_removed";
};

const dateKeyForNow = (): string => new Date().toISOString().slice(0, 10);

const readNumberField = (value: unknown, field: string): number => {
  if (!isRecord(value)) return 0;
  const candidate = value[field];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : 0;
};

export const createOxygenMemorial = async (input: OxygenMemorialInput): Promise<string> => {
  const db = getFirestore();
  const docRef = db.collection("memorials").doc();

  await docRef.set({
    memorialId: docRef.id,
    sessionId: input.sessionId,
    createdAt: FieldValue.serverTimestamp(),
    dayIndex: input.dayIndex,
    position: input.position,
    cases: input.cases,
    deaths: input.deaths,
    message: input.message,
    type: input.type,
  });

  return docRef.id;
};

export const recordDailySessionJoined = async (): Promise<void> => {
  const db = getFirestore();
  const dateKey = dateKeyForNow();
  await db.collection("dailyStats").doc(dateKey).set(
    {
      dateKey,
      totalSessions: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );
};

export const recordDailyCollapse = async (): Promise<void> => {
  const db = getFirestore();
  const dateKey = dateKeyForNow();
  await db.collection("dailyStats").doc(dateKey).set(
    {
      dateKey,
      totalCollapses: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );
};

export const recordPeakOnlineUsers = async (onlineUsersCount: number): Promise<void> => {
  if (onlineUsersCount <= 0) return;

  const db = getFirestore();
  const ref = db.collection("dailyStats").doc(dateKeyForNow());
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const currentPeak = readNumberField(snapshot.data(), "peakOnlineUsers");
    const nextPeak = Math.max(currentPeak, onlineUsersCount);

    transaction.set(
      ref,
      {
        dateKey: ref.id,
        peakOnlineUsers: nextPeak,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true}
    );
  });
};

