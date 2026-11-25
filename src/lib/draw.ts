import crypto from "node:crypto";

// Alfabeto legível sem caracteres ambíguos (0/O, 1/I/L)
const KEY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateSecretKey(): string {
  const part = (length: number): string => {
    let out = "";
    for (let i = 0; i < length; i++) {
      out += KEY_ALPHABET[crypto.randomInt(0, KEY_ALPHABET.length)];
    }
    return out;
  };
  return `AMIGO-${part(4)}-${part(4)}`;
}

/**
 * Normaliza a chave digitada pelo participante para tolerar espaços,
 * letras minúsculas ou ausência de hífens.
 */
export function normalizeSecretKey(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.startsWith("AMIGO") && cleaned.length === 13) {
    return `AMIGO-${cleaned.slice(5, 9)}-${cleaned.slice(9, 13)}`;
  }
  if (cleaned.length === 8) {
    return `AMIGO-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
  }
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashSecretKey(normalizedKey: string): string {
  return crypto.createHash("sha256").update(normalizedKey, "utf8").digest("hex");
}

export function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function sanitizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Realiza o sorteio de Amigo Secreto usando o algoritmo de Sattolo com
 * aleatoriedade criptograficamente segura (crypto.randomInt).
 *
 * Garantias matemáticas:
 * - Cada participante tira exatamente 1 pessoa e é tirado por exatamente 1 pessoa.
 * - Ninguém nunca tira a si mesmo (desarranjo garantido).
 * - Forma um único ciclo aleatório, evitando duplas fechadas (A->B e B->A).
 */
export function performSecretSantaDraw(
  participantIds: string[]
): Record<string, string> {
  if (participantIds.length < 2) {
    throw new Error("É necessário pelo menos 2 participantes para realizar o sorteio.");
  }

  const cycle = [...participantIds];
  for (let i = cycle.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i);
    const tmp = cycle[i];
    cycle[i] = cycle[j];
    cycle[j] = tmp;
  }

  const assignments: Record<string, string> = {};
  for (let i = 0; i < cycle.length; i++) {
    const giver = cycle[i];
    const receiver = cycle[(i + 1) % cycle.length];
    if (giver === receiver) {
      throw new Error("Falha de integridade: sorteio gerou auto-atribuição.");
    }
    assignments[giver] = receiver;
  }

  // Validação explícita da bijeção
  const uniqueReceivers = new Set(Object.values(assignments));
  if (uniqueReceivers.size !== participantIds.length) {
    throw new Error("Falha de integridade: sorteio não formou bijeção perfeita.");
  }

  return assignments;
}
