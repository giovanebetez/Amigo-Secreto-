import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = 3456;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATA_FILE = path.join(process.cwd(), ".data", "amigo-secreto.json");

async function cleanupDataFile() {
  try {
    await fs.unlink(DATA_FILE);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/status`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Servidor Next.js não respondeu dentro do tempo limite.");
}

async function main() {
  await cleanupDataFile();

  const nextBin = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, MAX_PARTICIPANTS: "15" },
  });

  let serverLogs = "";
  server.stdout.on("data", (d) => (serverLogs += d.toString()));
  server.stderr.on("data", (d) => (serverLogs += d.toString()));

  try {
    await waitForServer();

    // 1. Página inicial SSR
    const homeRes = await fetch(BASE_URL);
    assert.equal(homeRes.status, 200, "GET / deve retornar 200");
    const homeHtml = await homeRes.text();
    assert.ok(homeHtml.includes("Amigo Secreto"), "HTML deve conter título Amigo Secreto");

    // 2. Status inicial
    const initialStatus = await (await fetch(`${BASE_URL}/api/status`)).json();
    assert.equal(initialStatus.count, 0);
    assert.equal(initialStatus.maxParticipants, 15);
    assert.equal(initialStatus.status, "collecting");

    const names = [
      "Ana Clara",
      "Bruno Costa",
      "Carla Dias",
      "Diego Silva",
      "Eduarda Lima",
      "Felipe Rocha",
      "Gabriela Nunes",
      "Henrique Alves",
      "Isabela Souza",
      "João Pedro",
      "Karen Melo",
      "Lucas Ferreira",
      "Mariana Gomes",
      "Nicolas Ribeiro",
      "Olívia Martins",
    ];

    const keys = new Map();

    // 3. Cadastrar 14 primeiras pessoas
    for (let i = 0; i < 14; i++) {
      const res = await fetch(`${BASE_URL}/api/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: names[i] }),
      });
      assert.equal(res.status, 201, `Participante ${i + 1} deve cadastrar com 201`);
      const data = await res.json();
      assert.match(data.secretKey, /^AMIGO-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      assert.equal(data.status, "collecting");
      assert.equal(data.drawnNow, false);
      assert.equal(data.count, i + 1);
      keys.set(names[i], data.secretKey);
    }

    // 4. Testar nome duplicado (com variação de acento e maiúscula)
    const dupRes = await fetch(`${BASE_URL}/api/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "joao pedro" }),
    });
    assert.equal(dupRes.status, 409, "Nome duplicado deve retornar 409");

    // 5. Testar consulta antes de atingir 15 pessoas
    const earlyKey = keys.get("Ana Clara");
    const earlyRevealRes = await fetch(`${BASE_URL}/api/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: earlyKey }),
    });
    assert.equal(earlyRevealRes.status, 200);
    const earlyReveal = await earlyRevealRes.json();
    assert.equal(earlyReveal.status, "collecting");
    assert.equal(earlyReveal.participantName, "Ana Clara");
    assert.equal(earlyReveal.drawnName, null);
    assert.equal(earlyReveal.remaining, 1);

    // 6. Cadastrar 15ª pessoa -> deve disparar sorteio automaticamente!
    const lastRes = await fetch(`${BASE_URL}/api/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: names[14] }),
    });
    assert.equal(lastRes.status, 201);
    const lastData = await lastRes.json();
    assert.equal(lastData.count, 15);
    assert.equal(lastData.remaining, 0);
    assert.equal(lastData.status, "drawn");
    assert.equal(lastData.drawnNow, true);
    assert.ok(lastData.drawnAt);
    keys.set(names[14], lastData.secretKey);

    // 7. 16ª pessoa deve ser bloqueada
    const extraRes = await fetch(`${BASE_URL}/api/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pedro Extra" }),
    });
    assert.equal(extraRes.status, 409, "16ª pessoa deve ser bloqueada com 409");

    // 8. Chave inválida deve retornar 404
    const badKeyRes = await fetch(`${BASE_URL}/api/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "AMIGO-0000-0000" }),
    });
    assert.equal(badKeyRes.status, 404);

    // 9. Consultar todas as 15 chaves (inclusive testando normalização minúscula/sem hífen)
    const assignments = new Map();
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      let keyToSend = keys.get(name);
      if (i === 0) keyToSend = keyToSend.toLowerCase();
      if (i === 1) keyToSend = keyToSend.replaceAll("-", "");

      const revealRes = await fetch(`${BASE_URL}/api/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyToSend }),
      });
      assert.equal(revealRes.status, 200, `Consulta para ${name} deve retornar 200`);
      const reveal = await revealRes.json();
      assert.equal(reveal.status, "drawn");
      assert.equal(reveal.participantName, name);
      assert.ok(reveal.drawnName, `${name} deve ter tirado alguém`);
      assert.notEqual(reveal.drawnName, name, `${name} não pode tirar a si mesmo`);
      assignments.set(name, reveal.drawnName);
    }

    // 10. Verificar bijeção perfeita (todos os 15 nomes tirados exatamente 1 vez)
    const receivers = new Set(assignments.values());
    assert.equal(receivers.size, 15, "Todos os 15 participantes devem ser tirados exatamente uma vez");
    for (const name of names) {
      assert.ok(receivers.has(name), `${name} precisa ser tirado por alguém`);
    }

    // 11. Verificar ciclo único de tamanho 15 (Sattolo)
    const visited = new Set();
    let curr = names[0];
    while (!visited.has(curr)) {
      visited.add(curr);
      curr = assignments.get(curr);
    }
    assert.equal(visited.size, 15, "O sorteio deve formar um único ciclo de 15 pessoas");

    console.log("✅ Todos os testes E2E do Amigo Secreto (15 pessoas) passaram com sucesso!");
  } catch (err) {
    console.error("❌ Falha nos testes E2E:", err);
    if (serverLogs) console.error("Logs do servidor:\n", serverLogs);
    process.exitCode = 1;
  } finally {
    server.kill();
    await cleanupDataFile();
  }
}

main();
