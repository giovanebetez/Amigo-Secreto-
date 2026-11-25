import { NextResponse } from "next/server";
import { GameError, joinGame, StorageNotConfiguredError } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const result = await joinGame(typeof body.name === "string" ? body.name : "");
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof GameError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("POST /api/join error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Não foi possível realizar sua inscrição. Tente novamente.",
      },
      { status: 500 }
    );
  }
}
