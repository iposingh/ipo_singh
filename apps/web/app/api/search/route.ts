import { connection } from "next/server";
import { loadSearchSummaries } from "@/lib/api/ipo-singh";
import { parseSearchFilters, searchCatalogQuery } from "@/features/search/query";
import { publicSuggestions, suggestionLimit } from "@/features/search/suggestions";

export async function GET(request: Request) {
  await connection();
  const filters = parseSearchFilters(new URL(request.url).searchParams);
  if (filters.rejected === "text") {
    return Response.json({ items: [], rejected: true }, { headers: { "cache-control": "no-store" } });
  }
  const search = searchCatalogQuery(filters);
  if (!search) {
    return Response.json({ items: [] }, { headers: { "cache-control": "no-store" } });
  }
  const fetchImpl: typeof fetch = (input, init) => {
    const signals = [init?.signal, request.signal].filter((signal): signal is AbortSignal => signal != null);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    return fetch(input, { ...init, signal });
  };
  const loaded = await loadSearchSummaries(
    search.q,
    { origin: process.env.IPO_SINGH_API_ORIGIN, fetch: fetchImpl },
    {
      limit: suggestionLimit,
      maxPages: 1,
      board: search.board,
      status: search.status,
      from: search.from,
      to: search.to,
    },
  );
  if (loaded.status === "unavailable") {
    return Response.json({ items: [] }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (loaded.status !== "ready") {
    return Response.json({ items: [], rejected: loaded.status === "invalid" }, { headers: { "cache-control": "no-store" } });
  }
  return Response.json(
    { items: publicSuggestions(loaded.items) },
    { headers: { "cache-control": "no-store" } },
  );
}
