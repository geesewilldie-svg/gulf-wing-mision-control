import { createHash } from "node:crypto";
import type { KnowledgeDocument } from "../nexus";
import { boundedJSON } from "./agent-router";
export function researchProviderName() {
  return process.env.GW_NEXUS_SEARXNG_PORT
    ? "SearXNG web search (local service)"
    : "English Wikipedia (encyclopedia only)";
}
// Fixed origin only: never fetch URLs supplied by models or document passages.
export async function publicResearch(
  query: string,
  signal: AbortSignal,
): Promise<KnowledgeDocument[]> {
  if (process.env.GW_NEXUS_SEARXNG_PORT) {
    const port = Number(process.env.GW_NEXUS_SEARXNG_PORT);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw Error("Invalid local search port.");
    const url = new URL("http://127.0.0.1:" + port + "/search");
    url.search = new URLSearchParams({ q: query, format: "json" }).toString();
    const body = await boundedJSON(
      await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        redirect: "error",
      }),
    );
    if (!Array.isArray(body.results)) throw Error("Invalid search results.");
    const seen = new Set<string>();
    return body.results
      .slice(0, 5)
      .flatMap((r: { url?: unknown; title?: unknown; content?: unknown }) => {
        if (
          typeof r.url !== "string" ||
          r.url.length > 2000 ||
          seen.has(r.url) ||
          typeof r.title !== "string" ||
          typeof r.content !== "string"
        )
          return [];
        try {
          const target = new URL(r.url);
          if (
            !["http:", "https:"].includes(target.protocol) ||
            target.username ||
            target.password
          )
            return [];
        } catch {
          return [];
        }
        seen.add(r.url);
        return [
          {
            id:
              "web-search-" +
              createHash("sha256").update(r.url).digest("hex").slice(0, 20),
            source: "Web search · " + r.title.slice(0, 200),
            location: r.url.slice(0, 2000),
            text:
              "Search snippet retrieved " +
              new Date().toISOString() +
              ". The destination page was not fetched or independently verified.\n" +
              r.content.slice(0, 1800),
          },
        ];
      })
      .slice(0, 3);
  }
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "3",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exchars: "1800",
  }).toString();
  const body = await boundedJSON(
    await fetch(url, {
      headers: {
        "User-Agent": "GulfWingNexus/1.0 (public encyclopedia research)",
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      redirect: "error",
    }),
  );
  return Object.values(body.query?.pages ?? {})
    .flatMap((value) => {
      const p = value as {
        title?: unknown;
        extract?: unknown;
        pageid?: unknown;
      };
      if (
        typeof p.title !== "string" ||
        typeof p.extract !== "string" ||
        !p.extract.trim()
      )
        return [];
      return [
        {
          id: "web-wikipedia-" + String(p.pageid),
          source: "Wikipedia · " + p.title,
          location:
            "https://en.wikipedia.org/wiki/" +
            encodeURIComponent(p.title.replaceAll(" ", "_")),
          text:
            "Public encyclopedia excerpt retrieved " +
            new Date().toISOString() +
            ". This is not a comprehensive web search or a verified current business fact.\n" +
            p.extract.slice(0, 1800),
        },
      ];
    })
    .slice(0, 3);
}
