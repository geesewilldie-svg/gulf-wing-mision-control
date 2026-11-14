import { createGulfWingReceiver } from "@/lib/server/gulf-wing-integration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return createGulfWingReceiver().handle(request, "handshake");
}
