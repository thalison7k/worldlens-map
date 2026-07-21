import { createFileRoute } from "@tanstack/react-router";

/**
 * NOAA CPC ONI (Oceanic Niño Index) proxy — returns latest monthly
 * Niño 3.4 anomaly and derived ENSO phase. Public, no key required,
 * but needs a server proxy to bypass browser CORS.
 */
export const Route = createFileRoute("/api/public/enso")({
  server: {
    handlers: {
      GET: async () => {
        const upstream =
          "https://origin.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/detrend.nino34.ascii.txt";
        try {
          const r = await fetch(upstream, { headers: { Accept: "text/plain" } });
          if (!r.ok) throw new Error(String(r.status));
          const txt = await r.text();
          const lines = txt.trim().split(/\r?\n/).slice(1); // drop header
          const rows: { year: number; month: number; anom: number }[] = [];
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5) continue;
            const year = Number(parts[0]);
            const month = Number(parts[1]);
            const anom = Number(parts[4]); // ANOM column
            if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(anom)) {
              rows.push({ year, month, anom });
            }
          }
          const last = rows[rows.length - 1];
          const history = rows.slice(-24);
          const phase =
            !last ? "neutral" :
            last.anom >= 1.5 ? "strong-nino" :
            last.anom >= 0.5 ? "nino" :
            last.anom <= -1.5 ? "strong-nina" :
            last.anom <= -0.5 ? "nina" : "neutral";
          return new Response(
            JSON.stringify({ latest: last, phase, history }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
                "cache-control": "public, max-age=3600, stale-while-revalidate=21600",
              },
            },
          );
        } catch {
          return new Response(JSON.stringify({ latest: null, phase: "unknown", history: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
