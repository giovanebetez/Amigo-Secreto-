import crypto from "node:crypto";
import {
  generateSecretKey,
  hashSecretKey,
  normalizeName,
  normalizeSecretKey,
  performSecretSantaDraw,
  sanitizeDisplayName,
} from "./draw";
import {
  getStorageMode,
  readGameState,
  StorageNotConfiguredError,
  updateGameStateAtomic,
} from "./storage";
import type {
  GameStatus,
  JoinResult,
  PublicGameStatus,
  RevealResult,
} from "./types";

export class GameError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GameError";
    this.statusCode = statusCode;
  }
}

export function getMaxParticipants(): number {
  const parsed = Number.parseInt(process.env.MAX_PARTICIPANTS ?? "15", 10);
  if (!Number.isFinite(parsed) || parsed < 2 || parsed > 200) {
    return 15;
  }
  return parsed;
}

export async function getPublicGameStatus(): Promise<PublicGameStatus> {
  const maxParticipants = getMaxParticipants();
  const storageMode = getStorageMode();

  if (storageMode === "unconfigured") {
    return {
      maxParticipants,
      count: 0,
      remaining: maxParticipants,
      status: "collecting",
      drawnAt: null,
      participantNames: [],
      storageConfigured: false,
      storageMode,
    };
  }

  const state = await readGameState(maxParticipants);
  const effectiveMax = state.maxParticipants || maxParticipants;
  const count = state.participants.length;

  return {
    maxParticipants: effectiveMax,
    count,
    remaining: Math.max(0, effectiveMax - count),
    status: state.status,
    drawnAt: state.drawnAt,
    participantNames: state.participants
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    storageConfigured: true,
    storageMode,
  };
}

export async function joinGame(rawName: string): Promise<JoinResult> {
  if (typeof rawName !== "string") {
    throw new GameError("Informe o seu nome para participar.", 400);
  }

  const displayName = sanitizeDisplayName(rawName);
  if (displayName.length < 2) {
    throw new GameError("O nome precisa ter pelo menos 2 caracteres.", 400);
  }
  if (displayName.length > 40) {
    throw new GameError("O nome pode ter no máximo 40 caracteres.", 400);
  }

  const normName = normalizeName(displayName);
  const defaultMax = getMaxParticipants();

  return updateGameStateAtomic(defaultMax, (state) => {
    const maxParticipants = state.maxParticipants || defaultMax;

    if (
      state.status === "drawn" ||
      state.participants.length >= maxParticipants
    ) {
      throw new GameError(
        `As ${maxParticipants} vagas já foram preenchidas e o sorteio já foi realizado! Use sua chave na aba de consulta para ver quem você tirou.`,
        409
      );
    }

    const duplicate = state.participants.find(
      (p) => p.normalizedName === normName
    );
    if (duplicate) {
      throw new GameError(
        `O nome "${displayName}" já está inscrito. Se for outra pessoa com o mesmo nome, adicione o sobrenome.`,
        409
      );
    }

    let secretKey = generateSecretKey();
    let keyHash = hashSecretKey(secretKey);
    while (state.participants.some((p) => p.keyHash === keyHash)) {
      secretKey = generateSecretKey();
      keyHash = hashSecretKey(secretKey);
    }

    const nextParticipants = [
      ...state.participants,
      {
        id: crypto.randomUUID(),
        name: displayName,
        normalizedName: normName,
        keyHash,
        joinedAt: new Date().toISOString(),
      },
    ];

    let nextStatus: GameStatus = state.status;
    let nextAssignments = state.assignments;
    let nextDrawnAt = state.drawnAt;
    let drawnNow = false;

    if (nextParticipants.length >= maxParticipants) {
      nextAssignments = performSecretSantaDraw(
        nextParticipants.map((p) => p.id)
      );
      nextStatus = "drawn";
      nextDrawnAt = new Date().toISOString();
      drawnNow = true;
    }

    const nextState = {
      maxParticipants,
      status: nextStatus,
      participants: nextParticipants,
      assignments: nextAssignments,
      drawnAt: nextDrawnAt,
    };

    const count = nextParticipants.length;
    return {
      nextState,
      result: {
        participantName: displayName,
        secretKey,
        count,
        maxParticipants,
        remaining: Math.max(0, maxParticipants - count),
        status: nextStatus,
        drawnNow,
        drawnAt: nextDrawnAt,
      },
    };
  });
}

export async function revealAssignment(rawKey: string): Promise<RevealResult> {
  if (typeof rawKey !== "string" || !rawKey.trim()) {
    throw new GameError("Digite a chave secreta que você recebeu.", 400);
  }

  const normalizedKey = normalizeSecretKey(rawKey);
  const inputHashBuffer = Buffer.from(hashSecretKey(normalizedKey), "hex");
  const state = await readGameState(getMaxParticipants());

  const participant = state.participants.find((p) => {
    const storedBuffer = Buffer.from(p.keyHash, "hex");
    if (storedBuffer.length !== inputHashBuffer.length) return false;
    return crypto.timingSafeEqual(storedBuffer, inputHashBuffer);
  });

  if (!participant) {
    throw new GameError(
      "Chave não encontrada. Confira as letras e números da chave que você guardou.",
      404
    );
  }

  const maxParticipants = state.maxParticipants || getMaxParticipants();
  const count = state.participants.length;

  if (state.status !== "drawn") {
    return {
      status: "collecting",
      participantName: participant.name,
      drawnName: null,
      drawnAt: null,
      count,
      maxParticipants,
      remaining: Math.max(0, maxParticipants - count),
    };
  }

  const receiverId = state.assignments[participant.id];
  const receiver = state.participants.find((p) => p.id === receiverId);

  if (!receiver) {
    throw new GameError(
      "Não foi possível localizar o resultado do sorteio para esta chave.",
      500
    );
  }

  return {
    status: "drawn",
    participantName: participant.name,
    drawnName: receiver.name,
    drawnAt: state.drawnAt,
    count,
    maxParticipants,
    remaining: 0,
  };
}

export async function resetGame(): Promise<void> {
  const maxParticipants = getMaxParticipants();
  await updateGameStateAtomic(maxParticipants, () => ({
    nextState: {
      maxParticipants,
      status: "collecting",
      participants: [],
      assignments: {},
      drawnAt: null,
    },
    result: undefined,
  }));
}

export { StorageNotConfiguredError };
