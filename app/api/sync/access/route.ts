import { networkInterfaces } from "node:os";
import { authorized, failure, response } from "@/lib/server/sync-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await authorized(request, true);
    const port = new URL(request.url).port || "3000";
    const addresses = Object.values(networkInterfaces())
      .flat()
      .filter((entry) => entry && !entry.internal && entry.family === "IPv4")
      .map((entry) => entry!.address)
      .filter((address) =>
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address),
      );
    return response({
      urls: [...new Set(addresses)].map(
        (address) => "http://" + address + ":" + port + "/nexus",
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
