import { AmigoSecretoApp } from "@/components/AmigoSecretoApp";
import { getPublicGameStatus } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialStatus = await getPublicGameStatus();
  return <AmigoSecretoApp initialStatus={initialStatus} />;
}
