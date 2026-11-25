export type GameStatus = "collecting" | "drawn";

export interface Participant {
  id: string;
  name: string;
  normalizedName: string;
  keyHash: string;
  joinedAt: string;
}

export interface GameState {
  maxParticipants: number;
  status: GameStatus;
  participants: Participant[];
  /** Maps giver participant ID -> receiver participant ID */
  assignments: Record<string, string>;
  drawnAt: string | null;
}

export interface PublicGameStatus {
  maxParticipants: number;
  count: number;
  remaining: number;
  status: GameStatus;
  drawnAt: string | null;
  participantNames: string[];
  storageConfigured: boolean;
  storageMode:
    | "vercel-blob"
    | "upstash-rest"
    | "redis-tcp"
    | "local-file"
    | "unconfigured";
}

export interface JoinResult {
  participantName: string;
  secretKey: string;
  count: number;
  maxParticipants: number;
  remaining: number;
  status: GameStatus;
  drawnNow: boolean;
  drawnAt: string | null;
}

export interface RevealResult {
  status: GameStatus;
  participantName: string;
  drawnName: string | null;
  drawnAt: string | null;
  count: number;
  maxParticipants: number;
  remaining: number;
}
