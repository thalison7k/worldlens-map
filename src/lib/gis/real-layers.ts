import L from "leaflet";
import { fetchEarthquakes, magColor } from "./providers/usgs";
import { fetchAirStations, pm25Color } from "./providers/openaq";
import { fetchEnso, ensoColor, ensoLabel } from "./providers/enso";
import type { LayerDef, BuildCtx, BuiltLayer } from "./layer-defs";

/**
 * Environmental "real" layers backed by public APIs. They build async — an
 * empty layer group is returned immediately and populated when the fetch
 * resolves. No random data; failed fetches fall through to an empty group.
 */

function asyncGroup(
  build: (
    ctx: BuildCtx,
    group: L.LayerGroup,
  ) => Promise<{ count: number; setOpacity?: (o: number) => void } | void>,
): (ctx: BuildCtx) => BuiltLayer {
  return (ctx) => {
    const group = L.layerGroup();
    let disposed = false;
    let setOp: (o: number) => void = () => { /* noop */ };
    const meta = { count: 0 };
    const ready = build(ctx, group)
      .then((r) => {
        if (disposed) { group.clearLayers(); return { count: 0 }; }
        if (r) { meta.count = r.count; if (r.setOpacity) setOp = r.setOpacity; }
        return { count: meta.count };
      })
      .catch(() => ({ count: 0 }));
    return {
      layer: group,
      meta,
      ready,
      setOpacity: (o) => setOp(o),
      dispose: () => { disposed = true; group.clearLayers(); },
    };
  };
}

export const REAL_LAYER_DEFS: LayerDef[] = [
  {
    id: "earthquakes" as never,
    label: "Terremotos (USGS, 24h)",
    icon: "🌐",
    category: "ambiental",
    order: 92,
    defaultVisible: true,
    defaultOpacity: 1,
    legend: [
      { color: "#0ea5e9", label: "< 2" },
      { color: "#22c55e", label: "2–3" },
      { color: "#eab308", label: "3–4" },
      { color: "#f97316", label: "4–5" },
      { color: "#dc2626", label: "5–6" },
      { color: "#7f1d1d", label: "≥ 6" },
    ],
    build: asyncGroup(async (_ctx, group) => {
      const quakes = await fetchEarthquakes("day");
      const markers: L.CircleMarker[] = [];
      for (const q of quakes) {
        const c = magColor(q.mag);
        const m = L.circleMarker([q.lat, q.lng], {
          radius: Math.max(3, q.mag * 1.6),
          color: c, fillColor: c, fillOpacity: 0.7, weight: 1,
        }).bindPopup(
          `<b>M ${q.mag.toFixed(1)}</b> · ${q.place}<br/>Profundidade: ${q.depthKm.toFixed(1)} km<br/>${new Date(q.time).toLocaleString()}<br/><a href="${q.url}" target="_blank" rel="noreferrer">USGS</a>`,
        );
        m.addTo(group);
        markers.push(m);
      }
      return {
        count: markers.length,
        setOpacity: (o) => markers.forEach((m) => m.setStyle({ opacity: o, fillOpacity: 0.7 * o })),
      };
    }),
  },
  {
    id: "air_quality" as never,
    label: "Qualidade do ar (OpenAQ)",
    icon: "🫁",
    category: "ambiental",
    order: 46,
    defaultOpacity: 0.9,
    legend: [
      { color: "#22c55e", label: "Bom" },
      { color: "#eab308", label: "Moderado" },
      { color: "#ea580c", label: "Ruim" },
      { color: "#b91c1c", label: "Muito ruim" },
      { color: "#7f1d1d", label: "Perigoso" },
    ],
    build: asyncGroup(async (ctx, group) => {
      const stations = await fetchAirStations(ctx.bbox, 200);
      const markers: L.CircleMarker[] = [];
      for (const s of stations) {
        const c = pm25Color(s.value);
        const m = L.circleMarker([s.lat, s.lng], {
          radius: 6, color: c, fillColor: c, fillOpacity: 0.8, weight: 1,
        }).bindPopup(
          `<b>${s.city}, ${s.country}</b><br/>${s.parameter.toUpperCase()}: <b>${s.value.toFixed(1)} ${s.unit}</b><br/>${new Date(s.updated).toLocaleString()}`,
        );
        m.addTo(group);
        markers.push(m);
      }
      return {
        count: markers.length,
        setOpacity: (o) => markers.forEach((m) => m.setStyle({ opacity: o, fillOpacity: 0.8 * o })),
      };
    }),
  },
  {
    id: "el_nino" as never,
    label: "El Niño / La Niña (NOAA ONI)",
    icon: "🌊",
    category: "clima",
    order: 30,
    defaultOpacity: 0.55,
    legend: [
      { color: "#b91c1c", label: "El Niño forte (≥ 1.5)" },
      { color: "#ea580c", label: "El Niño (≥ 0.5)" },
      { color: "#64748b", label: "Neutro" },
      { color: "#0284c7", label: "La Niña (≤ -0.5)" },
      { color: "#1e40af", label: "La Niña forte (≤ -1.5)" },
    ],
    build: asyncGroup(async (_ctx, group) => {
      const data = await fetchEnso();
      const color = ensoColor(data.phase);
      // Niño 3.4 region: 5°S–5°N, 170°W–120°W
      const bounds: L.LatLngBoundsExpression = [[-5, -170], [5, -120]];
      const rect = L.rectangle(bounds, {
        color, weight: 2, fillColor: color, fillOpacity: 0.35,
      });
      const anom = data.latest ? data.latest.anom.toFixed(2) : "—";
      const when = data.latest ? `${data.latest.year}-${String(data.latest.month).padStart(2, "0")}` : "sem dados";
      rect.bindPopup(
        `<b>ENSO — Niño 3.4</b><br/>Fase: <b>${ensoLabel(data.phase)}</b><br/>Anomalia SST: <b>${anom} °C</b><br/>Referência: ${when}<br/><span style="opacity:.7">Fonte: NOAA CPC (ONI)</span>`,
      );
      rect.addTo(group);
      return {
        count: 1,
        setOpacity: (o) => rect.setStyle({ opacity: o, fillOpacity: 0.35 * o }),
      };
    }),
  },
];

/** Layer ids that need to rebuild whenever the map bbox changes. */
export const BBOX_DRIVEN_LAYERS = new Set(["air_quality"]);

/** Layers that manage their own realtime refresh. */
export const SELF_REFRESHING_LAYERS = new Set<string>();
