import { createFileRoute } from "@tanstack/react-router";

/**
 * NASA FIRMS active-fire proxy. Requires FIRMS_MAP_KEY (free from
 * firms.modaps.eosdis.nasa.gov). If the key is missing, returns an empty
 * list with `hasKey: false` so the client shows an informative empty state
 * rather than fabricating data.
 */
export const Route = createFileRoute("/api/public/firms")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const bbox = u.searchParams.get("bbox") ?? "";
        const days = Math.max(1, Math.min(10, Number(u.searchParams.get("days") ?? "1")));
        if (!/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(bbox)) {
          return json({ fires: [], hasKey: false, error: "bad bbox" }, 400);
        }
        const key = process.env.FIRMS_MAP_KEY;
        if (!key) return json({ fires: await fetchInpe(bbox, days), hasKey: false, source: "INPE" });
        // area/csv/{key}/{source}/{area}/{days}  — area = west,south,east,north
        const source = "VIIRS_NOAA20_NRT";
        const upstream = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${source}/${bbox}/${days}`;
        try {
          const r = await fetch(upstream, { headers: { Accept: "text/csv" } });
          if (!r.ok) return json({ fires: [], hasKey: true, upstream: r.status });
          const csv = await r.text();
          const lines = csv.trim().split(/\r?\n/);
          if (lines.length < 2) return json({ fires: [], hasKey: true });
          const header = lines[0].split(",");
          const idx = (name: string) => header.indexOf(name);
          const iLat = idx("latitude");
          const iLng = idx("longitude");
          const iBri = idx("bright_ti4");
          const iFrp = idx("frp");
          const iConf = idx("confidence");
          const iSat = idx("satellite");
          const iDate = idx("acq_date");
          const iTime = idx("acq_time");
          const fires = [];
          for (let li = 1; li < lines.length; li++) {
            const p = lines[li].split(",");
            const lat = Number(p[iLat]);
            const lng = Number(p[iLng]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            fires.push({
              lat, lng,
              brightness: Number(p[iBri]) || 0,
              frp: Number(p[iFrp]) || 0,
              confidence: p[iConf] ?? "",
              satellite: p[iSat] ?? source,
              date: p[iDate] ?? "",
              time: p[iTime] ?? "",
            });
          }
          if (fires.length === 0) return json({ fires: await fetchInpe(bbox, days), hasKey: true, source: "INPE" });
          return json({ fires, hasKey: true, source: "FIRMS" });
        } catch (e) {
          return json({ fires: await fetchInpe(bbox, days), hasKey: true, source: "INPE", error: String(e) });
        }
      },
    },
  },
});

/**
 * Fallback público e sem chave: focos ativos do Programa Queimadas do INPE
 * (GOES-19 / VIIRS / MODIS, atualização a cada ~10 min).
 */
async function fetchInpe(bbox: string, days: number) {
  const [w, s, e, n] = bbox.split(",").map(Number);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19) + "Z";
  const cql = encodeURIComponent(
    `BBOX(geometria,${w},${s},${e},${n},'EPSG:4326') AND data_hora_gmt >= ${since}`,
  );
  const url =
    "https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/bdqueimadas2/ows" +
    "?service=WFS&version=2.0.0&request=GetFeature&typeNames=bdqueimadas2:focos" +
    `&outputFormat=application/json&srsName=EPSG:4326&count=2000&CQL_FILTER=${cql}`;
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) { console.log('INPE not ok', r.status, url); return []; }
    const j = (await r.json()) as {
      features?: { properties: Record<string, unknown>; geometry?: { coordinates?: number[] } }[];
    };
    return (j.features ?? []).flatMap((f) => {
      const c = f.geometry?.coordinates;
      const p = f.properties ?? {};
      const lng = Number(c?.[0] ?? p.longitude);
      const lat = Number(c?.[1] ?? p.latitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const ts = String(p.data_hora_gmt ?? "");
      return [{
        lat,
        lng,
        brightness: 0,
        frp: Number(p.frp) || 0,
        confidence: String(p.satelite ?? "nominal"),
        satellite: `${p.satelite ?? "INPE"}${p.municipio ? ` · ${p.municipio}/${p.estado ?? ""}` : ""}`,
        date: ts.slice(0, 10),
        time: ts.slice(11, 16),
      }];
    });
  } catch (err) {
    console.log('INPE error', String(err));
    return [];
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300, stale-while-revalidate=1200",
    },
  });
}
