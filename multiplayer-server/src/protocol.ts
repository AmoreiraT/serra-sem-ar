export type PresenceVector = {
  x: number;
  y: number;
  z: number;
};

export type ClientHelloMessage = {
  sessionId: string;
  dayIndex: number;
  isMobile: boolean;
};

export type ClientStateMessage = {
  dayIndex: number;
  position: PresenceVector;
  isMobile: boolean;
};

export type ServerPeerState = {
  sessionId: string;
  roomId: number;
  dayIndex: number;
  position: PresenceVector;
  isMobile: boolean;
  lastSeenAt: number;
};

export type ServerSnapshotMessage = {
  serverTime: number;
  peers: ServerPeerState[];
};
