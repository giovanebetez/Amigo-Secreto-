import { NextResponse } from "next/server";
import {
  GameError,
  revealAssignment,
  StorageNotConfiguredError,
} from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { key?: unknown };
    const result = await revealAssignment(
      typeof body.key === "string" ? body.key : ""
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof GameError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("POST /api/reveal error:", err);
    return NextResponse.json(
      { error: "Não foi possível consultar sua chave agora. Tente novamente." },
      { status: 500 }
    );
  }
}
