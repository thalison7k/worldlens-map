import { createFileRoute } from "@tanstack/react-router";

/**
 * Ciclones tropicais ativos — cobertura global.
 *
 * Fontes públicas sem chave:
 *  1. NOAA / National Hurricane Center (Atlântico + Pacífico Leste)
 *  2. GDACS / JTWC (demais bacias: Pacífico Oeste, Índico, Austrália)
 *
 * O NHC frequentemente retorna lista vazia fora da temporada do Atlântico,
 * por isso o GDACS entra como fonte global complementar (não substituta).
 */
export const Route = createFileRoute("/api/public/cyclones")({
  server: {
    handlers: {
      GET: async () => {
        const [nhc, gdacs] = await Promise.all([fetchNHC(), fetchGDACS()]);
        const storms = [...nhc, ...dedupe(nhc, gdacs)];
        return json({ storms, source: "nhc+gdacs" });
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
  source: string;
};

async function fetchNHC(): Promise<Storm[]> {
  try {
    const r = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return [];
    const raw = (await r.json()) as { activeStorms?: unknown[] };
    return (raw.activeStorms ?? [])
      .map((s) => normalize(s as Record<string, unknown>))
      .filter((s): s is Storm => s != null);
  } catch {
    return [];
  }
}

/** GDACS: eventos TC ativos nas últimas 2 semanas (global, via JTWC). */
async function fetchGDACS(): Promise<Storm[]> {
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 14 * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const url =
      `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC` +
      `&alertlevel=Green;Orange;Red&fromdate=${fmt(from)}&todate=${fmt(now)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const raw = (await r.json()) as { features?: unknown[] };
    const out: Storm[] = [];
    for (const f of raw.features ?? []) {
      const feat = f as { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> };
      const p = feat.properties ?? {};
      if (String(p["iscurrent"] ?? "").toLowerCase() !== "true") continue;
      const c = feat.geometry?.coordinates ?? [];
      const lng = num(c[0]);
      const lat = num(c[1]);
      if (lat == null || lng == null) continue;
      const sev = p["severitydata"] as Record<string, unknown> | undefined;
      const kmh = num(sev?.["severity"]);
      out.push({
        id: `gdacs:${String(p["eventid"] ?? `${lat},${lng}`)}`,
        name: String(p["eventname"] ?? p["name"] ?? "Sem nome"),
        classification: String(p["alertlevel"] ?? "TC"),
        basin: String(p["iso3"] ?? "—"),
        lat,
        lng,
        intensityKt: kmh != null ? Math.round(kmh / 1.852) : null,
        pressureMb: null,
        movementDir: null,
        movementSpeedKt: null,
        lastUpdate: typeof p["datemodified"] === "string" ? p["datemodified"] : null,
        source: String(p["source"] ?? "GDACS"),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Remove eventos GDACS que já aparecem no NHC (mesmo nome ou ~2° de distância). */
function dedupe(primary: Storm[], extra: Storm[]): Storm[] {
  return extra.filter((e) =>
    !primary.some(
      (p) =>
        e.name.toUpperCase().includes(p.name.toUpperCase()) ||
        (Math.abs(p.lat - e.lat) < 2 && Math.abs(p.lng - e.lng) < 2),
    ),
  );
}

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
    source: "NOAA NHC",
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
