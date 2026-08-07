import { createFileRoute } from "@tanstack/react-router";

/**
 * Ciclones tropicais ativos (NOAA / National Hurricane Center).
 *
 * Fonte pública sem chave: https://www.nhc.noaa.gov/CurrentStorms.json
 * O proxy existe apenas para contornar CORS e normalizar o payload.
 */
export const Route = createFileRoute("/api/public/cyclones")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const r = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
            headers: { Accept: "application/json" },
          });
          if (!r.ok) return json({ storms: [], source: "nhc", error: `HTTP ${r.status}` });
          const raw = (await r.json()) as { activeStorms?: unknown[] };
          const storms = (raw.activeStorms ?? [])
            .map((s) => normalize(s as Record<string, unknown>))
            .filter((s): s is Storm => s != null);
          return json({ storms, source: "nhc" });
        } catch (err) {
          return json({ storms: [], source: "nhc", error: String(err) });
        }
      },
    },
  },
});

type Storm = {
  id: string;
  name: string;
  classification: string;
  basin: string;
  lat: number;
  lng: number;
  intensityKt: number | null;
  pressureMb: number | null;
  movementDir: number | null;
  movementSpeedKt: number | null;
  lastUpdate: string | null;
};

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function coord(numeric: unknown, text: unknown): number | null {
  const direct = num(numeric);
  if (direct != null) return direct;
  if (typeof text !== "string") return null;
  const m = text.trim().match(/^([\d.]+)\s*([NSEW])$/i);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  return /[SW]/i.test(m[2]) ? -v : v;
}

function normalize(s: Record<string, unknown>): Storm | null {
  const lat = coord(s["latitudeNumeric"], s["latitude"]);
  const lng = coord(s["longitudeNumeric"], s["longitude"]);
  if (lat == null || lng == null) return null;
  return {
    id: String(s["id"] ?? s["binNumber"] ?? `${lat},${lng}`),
    name: String(s["name"] ?? "Sem nome"),
    classification: String(s["classification"] ?? "??"),
    basin: String(s["binNumber"] ?? "").slice(0, 2) || "—",
    lat,
    lng,
    intensityKt: num(s["intensity"]),
    pressureMb: num(s["pressure"]),
    movementDir: num(s["movementDir"]),
    movementSpeedKt: num(s["movementSpeed"]),
    lastUpdate: typeof s["lastUpdate"] === "string" ? s["lastUpdate"] : null,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}
