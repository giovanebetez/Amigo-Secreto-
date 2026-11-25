"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Gift,
  KeyRound,
  Lock,
  PartyPopper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { JoinResult, PublicGameStatus, RevealResult } from "@/lib/types";

interface SavedCredential {
  name: string;
  key: string;
}

const STORAGE_LOCAL_KEY = "amigo_secreto_saved_key_v1";

function fireCelebrationConfetti() {
  const colors = ["#e11d48", "#f59e0b", "#10b981", "#fb7185", "#fbbf24"];
  confetti({
    particleCount: 75,
    spread: 70,
    origin: { y: 0.6 },
    colors,
  });
  setTimeout(() => {
    confetti({
      particleCount: 45,
      angle: 60,
      spread: 55,
      origin: { x: 0.1, y: 0.65 },
      colors,
    });
    confetti({
      particleCount: 45,
      angle: 120,
      spread: 55,
      origin: { x: 0.9, y: 0.65 },
      colors,
    });
  }, 220);
}

export function AmigoSecretoApp({
  initialStatus,
}: {
  initialStatus: PublicGameStatus;
}) {
  const [status, setStatus] = useState<PublicGameStatus>(initialStatus);
  const [activeTab, setActiveTab] = useState<"join" | "reveal">(
    initialStatus.status === "drawn" ? "reveal" : "join"
  );
  const [refreshing, setRefreshing] = useState(false);

  // Join form state
  const [nameInput, setNameInput] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<JoinResult | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Reveal form state
  const [keyInput, setKeyInput] = useState("");
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealResult, setRevealResult] = useState<RevealResult | null>(null);
  const [hideSecretName, setHideSecretName] = useState(false);

  // Saved key in browser localStorage (convenience only)
  const [savedCred, setSavedCred] = useState<SavedCredential | null>(null);
  const prevStatusRef = useRef(initialStatus.status);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedCredential;
        if (parsed?.key && parsed?.name) {
          setSavedCred(parsed);
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const fetchStatus = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as PublicGameStatus;
      setStatus(data);

      // Se acabou de transicionar para "drawn", comemora!
      if (prevStatusRef.current === "collecting" && data.status === "drawn") {
        fireCelebrationConfetti();
      }
      prevStatusRef.current = data.status;
    } catch {
      // Ignore transient poll errors
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  // Poll leve a cada 10s enquanto ainda está recebendo inscrições
  useEffect(() => {
    if (status.status !== "collecting" || !status.storageConfigured) return;
    const id = window.setInterval(() => {
      void fetchStatus(false);
    }, 10000);
    return () => window.clearInterval(id);
  }, [status.status, status.storageConfigured, fetchStatus]);

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);

    const trimmed = nameInput.trim();
    if (trimmed.length < 2) {
      setJoinError("Digite seu nome com pelo menos 2 letras.");
      return;
    }

    setJoinLoading(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json()) as JoinResult & { error?: string };

      if (!res.ok) {
        setJoinError(data.error || "Não foi possível confirmar sua vaga.");
        await fetchStatus(false);
        return;
      }

      setJoinSuccess(data);
      setNameInput("");
      setCopiedKey(false);

      const cred: SavedCredential = {
        name: data.participantName,
        key: data.secretKey,
      };
      setSavedCred(cred);
      try {
        window.localStorage.setItem(STORAGE_LOCAL_KEY, JSON.stringify(cred));
      } catch {
        // Ignore
      }

      if (data.drawnNow) {
        fireCelebrationConfetti();
      }

      await fetchStatus(false);
    } catch {
      setJoinError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setJoinLoading(false);
    }
  }

  async function runReveal(keyToUse: string) {
    setRevealError(null);
    setRevealResult(null);
    setHideSecretName(false);

    if (!keyToUse.trim()) {
      setRevealError("Digite ou cole a chave secreta que você guardou.");
      return;
    }

    setRevealLoading(true);
    try {
      const res = await fetch("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyToUse.trim() }),
      });
      const data = (await res.json()) as RevealResult & { error?: string };

      if (!res.ok) {
        setRevealError(data.error || "Chave inválida.");
        return;
      }

      setRevealResult(data);
      if (data.status === "drawn" && data.drawnName) {
        fireCelebrationConfetti();
      }
      await fetchStatus(false);
    } catch {
      setRevealError("Falha de conexão. Tente novamente em instantes.");
    } finally {
      setRevealLoading(false);
    }
  }

  async function handleRevealSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runReveal(keyInput);
  }

  async function handleCopyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    } catch {
      setCopiedKey(false);
    }
  }

  function jumpToRevealWithKey(key: string) {
    setKeyInput(key);
    setActiveTab("reveal");
    void runReveal(key);
  }

  const progressPercent = Math.min(
    100,
    Math.round((status.count / Math.max(1, status.maxParticipants)) * 100)
  );
  const emptySlots = Math.max(0, status.maxParticipants - status.count);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-rose-50/90 via-[#fff9f5] to-amber-50/60">
      {/* Decoração de fundo suave */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-rose-200/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-40 -right-24 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl"
      />

      <main className="relative mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <header className="text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600 to-red-700 text-white shadow-lg shadow-rose-600/25 animate-float-slow">
            <Gift className="h-8 w-8" />
          </div>

          <div className="mb-3 flex justify-center">
            {status.status === "drawn" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-200">
                <PartyPopper className="h-3.5 w-3.5" />
                Sorteio realizado!
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-800 ring-1 ring-rose-200">
                <Sparkles className="h-3.5 w-3.5" />
                Inscrições abertas
              </span>
            )}
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
            Amigo Secreto
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 sm:text-base">
            {status.status === "drawn"
              ? `As ${status.maxParticipants} pessoas já entraram e a máquina fez o sorteio! Use sua chave secreta abaixo para descobrir quem você tirou.`
              : `Coloque seu nome, guarde sua chave secreta e aguarde completar ${status.maxParticipants} pessoas para o sorteio automático.`}
          </p>
        </header>

        {/* Aviso caso storage não esteja configurado na Vercel */}
        {!status.storageConfigured && (
          <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold">
                  Banco de dados ainda não conectado na Vercel
                </p>
                <p className="mt-1 text-amber-800">
                  Para que todas as {status.maxParticipants} pessoas compartilhem
                  o mesmo sorteio, conecte o banco{" "}
                  <strong>Neon Postgres</strong> (aba{" "}
                  <strong>Storage → Create Database → Neon</strong>) no painel
                  do projeto na Vercel e faça um Redeploy.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Card de Progresso */}
        <section className="mt-7 rounded-3xl border border-stone-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <Users className="h-4 w-4 text-rose-600" />
              <span>
                {status.count} de {status.maxParticipants} participantes
              </span>
            </div>
            <button
              type="button"
              onClick={() => void fetchStatus(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
              title="Atualizar status"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Atualizar
            </button>
          </div>

          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                status.status === "drawn"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                  : "bg-gradient-to-r from-rose-500 via-red-500 to-amber-500"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <p className="mt-2.5 text-xs font-medium text-stone-600">
            {status.status === "drawn" ? (
              <span className="text-emerald-700">
                Grupo completo! O sorteio já foi feito automaticamente pela
                máquina.
              </span>
            ) : status.remaining === 1 ? (
              <span className="text-rose-700">
                Falta apenas <strong>1 pessoa</strong> para o sorteio acontecer
                automaticamente!
              </span>
            ) : (
              <>
                Faltam <strong>{status.remaining} pessoas</strong> para o
                sorteio acontecer automaticamente.
              </>
            )}
          </p>
        </section>

        {/* Seletor de Abas */}
        <div
          role="tablist"
          aria-label="Ações do Amigo Secreto"
          className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-stone-200/70 p-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "join"}
            onClick={() => setActiveTab("join")}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
              activeTab === "join"
                ? "bg-white text-rose-700 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            <span>Participar</span>
            {status.status === "drawn" && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                Lotado
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "reveal"}
            onClick={() => setActiveTab("reveal")}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
              activeTab === "reveal"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <KeyRound className="h-4 w-4" />
            <span>Usar minha chave</span>
          </button>
        </div>

        {/* Conteúdo Principal */}
        <section className="mt-4 rounded-3xl border border-stone-200/80 bg-white p-6 shadow-md shadow-stone-900/5 sm:p-8">
          {activeTab === "join" ? (
            joinSuccess ? (
              /* Cartão da Chave Gerada */
              <div className="animate-pop-in text-center">
                <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="h-6 w-6" />
                </div>

                <h2 className="text-xl font-extrabold text-stone-900 sm:text-2xl">
                  Tudo certo, {joinSuccess.participantName}!
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  {joinSuccess.drawnNow
                    ? "Você foi a última pessoa a entrar — o sorteio acabou de acontecer!"
                    : `Você é o participante nº ${joinSuccess.count} de ${joinSuccess.maxParticipants}.`}
                </p>

                <div className="mt-5 rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/70 p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-rose-700">
                    Sua Chave Secreta
                  </p>
                  <p className="mt-2 select-all font-mono text-2xl font-bold tracking-wider text-stone-900 sm:text-3xl">
                    {joinSuccess.secretKey}
                  </p>

                  <button
                    type="button"
                    onClick={() => void handleCopyKey(joinSuccess.secretKey)}
                    className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition sm:w-auto sm:px-6 ${
                      copiedKey
                        ? "bg-emerald-600 text-white"
                        : "bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.99]"
                    }`}
                  >
                    {copiedKey ? (
                      <>
                        <Check className="h-4 w-4" />
                        Chave copiada!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar minha chave
                      </>
                    )}
                  </button>
                </div>

                <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-left text-xs text-amber-900">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p>
                    <strong>Guarde esta chave com cuidado!</strong> Tire um
                    print ou cole no seu bloco de notas/WhatsApp. Por segurança,
                    ela <strong>não será mostrada novamente</strong> e você vai
                    precisar dela para ver quem tirou.
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                  {joinSuccess.drawnNow ? (
                    <button
                      type="button"
                      onClick={() => jumpToRevealWithKey(joinSuccess.secretKey)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <PartyPopper className="h-4 w-4" />
                      Ver agora quem eu tirei!
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setKeyInput(joinSuccess.secretKey);
                        setActiveTab("reveal");
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800"
                    >
                      <KeyRound className="h-4 w-4" />
                      Ir para a aba de consulta
                    </button>
                  )}

                  {status.status === "collecting" && (
                    <button
                      type="button"
                      onClick={() => setJoinSuccess(null)}
                      className="inline-flex items-center justify-center rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-600 transition hover:bg-stone-50 hover:text-stone-900"
                    >
                      Cadastrar outra pessoa
                    </button>
                  )}
                </div>
              </div>
            ) : status.status === "drawn" ? (
              /* Inscrições encerradas */
              <div className="py-4 text-center">
                <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <PartyPopper className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-extrabold text-stone-900">
                  As {status.maxParticipants} vagas já foram preenchidas!
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
                  O sorteio automático já aconteceu. Se você garantiu sua vaga,
                  use a chave que guardou para descobrir quem você tirou.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("reveal")}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <KeyRound className="h-4 w-4" />
                  Consultar com minha chave
                </button>
              </div>
            ) : (
              /* Formulário de Inscrição */
              <form onSubmit={handleJoinSubmit} className="space-y-5">
                <div>
                  <h2 className="text-xl font-extrabold text-stone-900">
                    Entre no Amigo Secreto
                  </h2>
                  <p className="mt-1 text-sm text-stone-600">
                    Informe seu nome abaixo para receber sua chave secreta
                    exclusiva.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="participant-name"
                    className="block text-sm font-semibold text-stone-800"
                  >
                    Seu nome (ou nome e sobrenome)
                  </label>
                  <input
                    id="participant-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={40}
                    autoComplete="name"
                    placeholder="Ex.: Maria Silva"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    disabled={joinLoading || !status.storageConfigured}
                    className="mt-2 block w-full rounded-xl border border-stone-300 bg-stone-50/50 px-4 py-3.5 text-base font-medium text-stone-900 placeholder:text-stone-400 transition focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/15 disabled:opacity-60"
                  />
                </div>

                {joinError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                  >
                    {joinError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={joinLoading || !status.storageConfigured}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-3.5 text-base font-bold text-white shadow-md shadow-rose-600/20 transition hover:from-rose-700 hover:to-red-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {joinLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Gerando sua chave...
                    </>
                  ) : (
                    <>
                      <Gift className="h-5 w-5" />
                      Entrar e gerar minha chave
                    </>
                  )}
                </button>

                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-stone-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Sorteio 100% automático e secreto — ninguém nunca tira a si
                  mesmo.
                </p>
              </form>
            )
          ) : (
            /* Aba de Consulta com a Chave */
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-extrabold text-stone-900">
                  Descubra quem você tirou
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  Digite a chave que você recebeu ao se inscrever (ex.:{" "}
                  <span className="font-mono font-semibold text-stone-800">
                    AMIGO-XXXX-XXXX
                  </span>
                  ).
                </p>
              </div>

              {savedCred && !keyInput && (
                <button
                  type="button"
                  onClick={() => setKeyInput(savedCred.key)}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Usar chave salva neste dispositivo ({savedCred.name})
                </button>
              )}

              <form onSubmit={handleRevealSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="secret-key"
                    className="block text-sm font-semibold text-stone-800"
                  >
                    Sua chave secreta
                  </label>
                  <input
                    id="secret-key"
                    type="text"
                    required
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="AMIGO-XXXX-XXXX"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                    disabled={revealLoading || !status.storageConfigured}
                    className="mt-2 block w-full rounded-xl border border-stone-300 bg-stone-50/50 px-4 py-3.5 font-mono text-base font-bold uppercase tracking-wider text-stone-900 placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-stone-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/15 disabled:opacity-60"
                  />
                </div>

                {revealError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                  >
                    {revealError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={revealLoading || !status.storageConfigured}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3.5 text-base font-bold text-white shadow-md shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {revealLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Verificando chave...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      Consultar resultado
                    </>
                  )}
                </button>
              </form>

              {/* Resultado da Consulta */}
              {revealResult && (
                <div className="animate-pop-in">
                  {revealResult.status === "collecting" ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-center">
                      <p className="text-sm font-bold text-amber-900">
                        Olá, {revealResult.participantName}! Sua chave está
                        certinha.
                      </p>
                      <p className="mt-1.5 text-sm text-amber-800">
                        O sorteio ainda não aconteceu — temos{" "}
                        <strong>
                          {revealResult.count} de {revealResult.maxParticipants}
                        </strong>{" "}
                        participantes. Assim que{" "}
                        {revealResult.remaining === 1
                          ? "faltar entrar só mais 1 pessoa e ela confirmar"
                          : `as outras ${revealResult.remaining} pessoas entrarem`}
                        , volte aqui com esta mesma chave!
                      </p>
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 text-center shadow-inner">
                      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                        Resultado Secreto de {revealResult.participantName}
                      </p>
                      <p className="mt-2 text-sm text-stone-600">
                        Você tirou no Amigo Secreto:
                      </p>

                      <div className="my-4 rounded-2xl bg-white px-4 py-5 shadow-sm ring-1 ring-emerald-200">
                        {hideSecretName ? (
                          <p className="font-mono text-2xl font-bold tracking-widest text-stone-400">
                            ••••••••••
                          </p>
                        ) : (
                          <p className="text-3xl font-extrabold tracking-tight text-rose-600 sm:text-4xl">
                            {revealResult.drawnName}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setHideSecretName((v) => !v)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
                        >
                          {hideSecretName ? (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              Mostrar nome novamente
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3.5 w-3.5" />
                              Ocultar da tela
                            </>
                          )}
                        </button>
                      </div>

                      <p className="mt-3 text-xs text-stone-500">
                        Shhh! Guarde segredo até o dia da revelação.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Lista de Participantes */}
        <section className="mt-6 rounded-3xl border border-stone-200/80 bg-white/85 p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">
              Quem já está no grupo ({status.count}/{status.maxParticipants})
            </h3>
            <span className="text-xs text-stone-500">Ordem alfabética</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {status.participantNames.map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-950"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="truncate" title={name}>
                  {name}
                </span>
              </div>
            ))}

            {Array.from({ length: emptySlots }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className="flex items-center gap-2 rounded-xl border border-dashed border-stone-200 bg-stone-50/60 px-3 py-2 text-xs text-stone-400"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-stone-200" />
                <span>Vaga aberta</span>
              </div>
            ))}
          </div>
        </section>

        {/* Como Funciona */}
        <footer className="mt-6 rounded-3xl border border-stone-200/70 bg-white/70 p-5 text-xs text-stone-600">
          <p className="font-bold text-stone-800">Como funciona:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              Cada pessoa entra no site, digita seu nome e recebe uma{" "}
              <strong>chave secreta única</strong> para guardar.
            </li>
            <li>
              Assim que a{" "}
              <strong>{status.maxParticipants}ª pessoa</strong> se cadastrar, o
              sistema realiza o sorteio automaticamente.
            </li>
            <li>
              Depois do sorteio, todos voltam na aba{" "}
              <strong>Usar minha chave</strong> para descobrir quem tiraram!
            </li>
          </ol>
        </footer>
      </main>
    </div>
  );
}
