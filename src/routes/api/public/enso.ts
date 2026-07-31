import { createFileRoute } from "@tanstack/react-router";

/**
 * Índice Niño 3.4 (NOAA PSL) — anomalia mensal de TSM e fase ENSO derivada.
 * Fonte pública sem chave; o proxy existe apenas para contornar CORS.
 */
export const Route = createFileRoute("/api/public/enso")({
  server: {
    handlers: {
      GET: async () => {
        const sources = [
          "https://psl.noaa.gov/data/correlation/nina34.anom.data",
          "https://psl.noaa.gov/data/correlation/nina34.data",
        ];
        for (const upstream of sources) {
          try {
            const r = await fetch(upstream, { headers: { Accept: "text/plain" } });
            if (!r.ok) continue;
            const txt = await r.text();
            const rows: { year: number; month: number; anom: number }[] = [];
            for (const line of txt.split(/\r?\n/)) {
              const parts = line.trim().split(/\s+/).map(Number);
              // linhas de dados: ano seguido de 12 valores mensais
              if (parts.length !== 13) continue;
              const year = parts[0];
              if (!Number.isFinite(year) || year < 1800 || year > 2200) continue;
              for (let m = 1; m <= 12; m++) {
                const anom = parts[m];
                if (!Number.isFinite(anom) || anom <= -90) continue;
                rows.push({ year, month: m, anom });
              }
            }
            if (rows.length === 0) continue;
            const last = rows[rows.length - 1];
            const history = rows.slice(-24);
            const phase =
              last.anom >= 1.5 ? "strong-nino" :
              last.anom >= 0.5 ? "nino" :
              last.anom <= -1.5 ? "strong-nina" :
              last.anom <= -0.5 ? "nina" : "neutral";
            return json({ latest: last, phase, history });
          } catch {
            /* tenta a próxima fonte */
          }
        }
        return json({ latest: null, phase: "unknown", history: [] });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600, stale-while-revalidate=21600",
    },
  });
}
