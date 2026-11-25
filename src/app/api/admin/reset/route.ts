import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { resetGame, StorageNotConfiguredError } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      return NextResponse.json(
        { error: "Reset administrativo não está habilitado neste servidor." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      secret?: unknown;
    };
    const provided = typeof body.secret === "string" ? body.secret : "";
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(adminSecret, "utf8");

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Segredo inválido." }, { status: 401 });
    }

    await resetGame();
    return NextResponse.json({ ok: true, message: "Jogo reiniciado com sucesso." });
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("POST /api/admin/reset error:", err);
    return NextResponse.json(
      { error: "Erro ao reiniciar o jogo." },
      { status: 500 }
    );
  }
}
