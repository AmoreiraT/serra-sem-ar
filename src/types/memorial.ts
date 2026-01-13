import type { Timestamp } from 'firebase/firestore';

export type MemorialEntry = {
  id: string;
  date: string;
  dateIndex?: number | null;
  name?: string | null;
  message: string;
  uid: string;
  userName?: string | null;
  userPhoto?: string | null;
  createdAt?: Timestamp | null;
};
