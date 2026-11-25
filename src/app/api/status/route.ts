import { NextResponse } from "next/server";
import { getPublicGameStatus } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getPublicGameStatus();
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("GET /api/status error:", err);
    return NextResponse.json(
      { error: "Erro ao carregar o status do amigo secreto." },
      { status: 500 }
    );
  }
}
