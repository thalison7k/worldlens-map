import { createFileRoute } from "@tanstack/react-router";

/**
 * Public server proxy for OpenAQ v3. The browser cannot call
 * api.openaq.org directly (no CORS), so we forward the request
 * server-side. No API key required for /locations.
 */
export const Route = createFileRoute("/api/public/openaq")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const bbox = u.searchParams.get("bbox") ?? "";
        const limit = u.searchParams.get("limit") ?? "200";
        // Validate bbox: 4 comma-separated numbers
        if (!/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(bbox)) {
          return new Response(JSON.stringify({ error: "bad bbox" }), { status: 400, headers: { "content-type": "application/json" } });
        }
        const upstream = `https://api.openaq.org/v3/locations?bbox=${bbox}&limit=${encodeURIComponent(limit)}`;
        try {
          const r = await fetch(upstream, { headers: { Accept: "application/json" } });
          const body = await r.text();
          return new Response(body, {
            status: r.status,
            headers: {
              "content-type": r.headers.get("content-type") ?? "application/json",
              "cache-control": "public, max-age=300, stale-while-revalidate=600",
            },
          });
        } catch (e) {
          return new Response(JSON.stringify({ results: [], error: String(e) }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
