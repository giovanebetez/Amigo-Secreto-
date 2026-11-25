import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BlobError,
  BlobPreconditionFailedError,
  get as blobGet,
  put as blobPut,
} from "@vercel/blob";
import { createClient, type RedisClientType } from "redis";
import type { GameState } from "./types";

const STATE_KEY = "amigo_secreto:state:v1";
const LOCK_KEY = "amigo_secreto:lock:v1";
const BLOB_PATH = "amigo-secreto/state-v1.json";
const LOCAL_FILE_PATH = path.join(process.cwd(), ".data", "amigo-secreto.json");

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Armazenamento na nuvem não configurado. Conecte um Vercel Blob ou banco Redis no painel do projeto na Vercel."
    );
    this.name = "StorageNotConfiguredError";
  }
}

export type StorageMode =
  | "vercel-blob"
  | "upstash-rest"
  | "redis-tcp"
  | "local-file"
  | "unconfigured";

function getUpstashRestConfig(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (url && token) {
    return { url: url.replace(/\/+$/, ""), token };
  }
  return null;
}

function hasVercelBlobConfig(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID
  );
}

export function getStorageMode(): StorageMode {
  if (getUpstashRestConfig()) return "upstash-rest";
  if (process.env.REDIS_URL) return "redis-tcp";
  if (hasVercelBlobConfig()) return "vercel-blob";
  if (!process.env.VERCEL) return "local-file";
  return "unconfigured";
}

function createEmptyState(maxParticipants: number): GameState {
  return {
    maxParticipants,
    status: "collecting",
    participants: [],
    assignments: {},
    drawnAt: null,
  };
}

// --- Upstash / Vercel KV REST helpers ---
async function upstashCommand<T = unknown>(
  args: (string | number)[]
): Promise<T> {
  const cfg = getUpstashRestConfig();
  if (!cfg) throw new StorageNotConfiguredError();

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash REST error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { result: T; error?: string };
  if (data.error) {
    throw new Error(`Upstash command error: ${data.error}`);
  }
  return data.result;
}

// --- Standard Redis TCP client (global singleton for serverless reuse) ---
const globalForRedis = globalThis as unknown as {
  __amigoSecretoRedis?: RedisClientType;
  __amigoSecretoLocalLock?: Promise<void>;
};

async function getRedisClient(): Promise<RedisClientType> {
  if (!process.env.REDIS_URL) throw new StorageNotConfiguredError();
  if (!globalForRedis.__amigoSecretoRedis) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => {
      console.error("Redis client error:", err);
    });
    globalForRedis.__amigoSecretoRedis = client as RedisClientType;
  }
  const client = globalForRedis.__amigoSecretoRedis;
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}

// --- Vercel Blob (Private Store + Optimistic Concurrency with ETag) ---
async function readBlobStateWithEtag(
  defaultMaxParticipants: number
): Promise<{ state: GameState; etag: string | null }> {
  const res = await blobGet(BLOB_PATH, {
    access: "private",
    useCache: false,
  });

  if (!res || res.statusCode !== 200 || !res.stream) {
    return { state: createEmptyState(defaultMaxParticipants), etag: null };
  }

  const text = await new Response(res.stream).text();
  return {
    state: JSON.parse(text) as GameState,
    etag: res.blob.etag,
  };
}

async function writeBlobStateConditional(
  state: GameState,
  expectedEtag: string | null
): Promise<void> {
  const payload = JSON.stringify(state, null, 2);
  if (expectedEtag) {
    await blobPut(BLOB_PATH, payload, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      ifMatch: expectedEtag,
      contentType: "application/json",
    });
  } else {
    await blobPut(BLOB_PATH, payload, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    });
  }
}

// --- Read / Write state ---
export async function readGameState(
  defaultMaxParticipants: number
): Promise<GameState> {
  const mode = getStorageMode();

  if (mode === "upstash-rest") {
    const raw = await upstashCommand<string | null>(["GET", STATE_KEY]);
    if (!raw) return createEmptyState(defaultMaxParticipants);
    return JSON.parse(raw) as GameState;
  }

  if (mode === "redis-tcp") {
    const client = await getRedisClient();
    const raw = await client.get(STATE_KEY);
    if (!raw) return createEmptyState(defaultMaxParticipants);
    return JSON.parse(raw) as GameState;
  }

  if (mode === "vercel-blob") {
    const { state } = await readBlobStateWithEtag(defaultMaxParticipants);
    return state;
  }

  if (mode === "local-file") {
    try {
      const raw = await fs.readFile(LOCAL_FILE_PATH, "utf8");
      return JSON.parse(raw) as GameState;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        return createEmptyState(defaultMaxParticipants);
      }
      throw err;
    }
  }

  throw new StorageNotConfiguredError();
}

async function writeNonBlobState(state: GameState): Promise<void> {
  const mode = getStorageMode();
  const payload = JSON.stringify(state, null, 2);

  if (mode === "upstash-rest") {
    await upstashCommand(["SET", STATE_KEY, payload]);
    return;
  }

  if (mode === "redis-tcp") {
    const client = await getRedisClient();
    await client.set(STATE_KEY, payload);
    return;
  }

  if (mode === "local-file") {
    await fs.mkdir(path.dirname(LOCAL_FILE_PATH), { recursive: true });
    const tmpPath = `${LOCAL_FILE_PATH}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, payload, "utf8");
    await fs.rename(tmpPath, LOCAL_FILE_PATH);
    return;
  }

  throw new StorageNotConfiguredError();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma atualização atômica do estado do jogo:
 * - No Vercel Blob: usa Compare-And-Swap via ETag (`ifMatch`) com retry automático.
 * - No Redis/Upstash: usa distributed lock (`SET NX PX`).
 * - Localmente: usa fila mutex in-process + rename atômico.
 */
export async function updateGameStateAtomic<T>(
  defaultMaxParticipants: number,
  mutator: (state: GameState) => { nextState: GameState; result: T }
): Promise<T> {
  const mode = getStorageMode();

  if (mode === "unconfigured") {
    throw new StorageNotConfiguredError();
  }

  if (mode === "vercel-blob") {
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { state, etag } = await readBlobStateWithEtag(
        defaultMaxParticipants
      );
      const { nextState, result } = mutator(state);
      try {
        await writeBlobStateConditional(nextState, etag);
        return result;
      } catch (err: unknown) {
        const isConflict =
          err instanceof BlobPreconditionFailedError ||
          (err instanceof BlobError &&
            /already exists|precondition/i.test(err.message));
        if (isConflict && attempt < maxAttempts - 1) {
          await sleep(100 + crypto.randomInt(0, 120));
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      "Muitas pessoas entrando ao mesmo tempo. Tente novamente em alguns segundos."
    );
  }

  if (mode === "local-file") {
    const prev = globalForRedis.__amigoSecretoLocalLock ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalForRedis.__amigoSecretoLocalLock = prev.then(() => next);
    await prev;
    try {
      const state = await readGameState(defaultMaxParticipants);
      const { nextState, result } = mutator(state);
      await writeNonBlobState(nextState);
      return result;
    } finally {
      release();
    }
  }

  // Redis / Upstash distributed lock
  const token = crypto.randomUUID();
  const maxAttempts = 25;
  let acquired = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (mode === "upstash-rest") {
      const res = await upstashCommand<string | null>([
        "SET",
        LOCK_KEY,
        token,
        "NX",
        "PX",
        8000,
      ]);
      acquired = res === "OK";
    } else if (mode === "redis-tcp") {
      const client = await getRedisClient();
      const res = await client.set(LOCK_KEY, token, { NX: true, PX: 8000 });
      acquired = res === "OK";
    }

    if (acquired) break;
    await sleep(120 + crypto.randomInt(0, 80));
  }

  if (!acquired) {
    throw new Error(
      "Muitas pessoas entrando ao mesmo tempo. Tente novamente em alguns segundos."
    );
  }

  try {
    const state = await readGameState(defaultMaxParticipants);
    const { nextState, result } = mutator(state);
    await writeNonBlobState(nextState);
    return result;
  } finally {
    const releaseScript =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    try {
      if (mode === "upstash-rest") {
        await upstashCommand(["EVAL", releaseScript, 1, LOCK_KEY, token]);
      } else if (mode === "redis-tcp") {
        const client = await getRedisClient();
        await client.eval(releaseScript, {
          keys: [LOCK_KEY],
          arguments: [token],
        });
      }
    } catch (err) {
      console.error("Failed to release lock:", err);
    }
  }
}
