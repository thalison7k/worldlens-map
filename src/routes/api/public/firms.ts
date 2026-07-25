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
        if (!key) return json({ fires: [], hasKey: false });
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
          return json({ fires, hasKey: true });
        } catch (e) {
          return json({ fires: [], hasKey: true, error: String(e) });
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300, stale-while-revalidate=1200",
    },
  });
}
