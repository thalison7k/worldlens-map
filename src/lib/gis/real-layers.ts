import L from "leaflet";
import { fetchEarthquakes, magColor } from "./providers/usgs";
import { fetchPois, POI_STYLE, type Poi } from "./providers/overpass";
import { fetchAirStations, pm25Color } from "./providers/openaq";
import type { LayerDef, BuildCtx, BuiltLayer } from "./layer-defs";

/**
 * "Real" layers backed by public APIs. They build async — a placeholder empty
 * group is returned immediately, then populated when the fetch resolves.
 */

function asyncGroup(build: (ctx: BuildCtx, group: L.LayerGroup) => Promise<{ count: number; setOpacity?: (o: number) => void } | void>): (ctx: BuildCtx) => BuiltLayer {
  return (ctx) => {
    const group = L.layerGroup();
    let disposed = false;
    let setOp: (o: number) => void = () => { /* noop until loaded */ };
    let count = 0;
    void build(ctx, group).then((r) => {
      if (disposed) { group.clearLayers(); return; }
      if (r) {
        count = r.count;
        if (r.setOpacity) setOp = r.setOpacity;
      }
    }).catch(() => { /* silent — cache/fallback already handled */ });
    return {
      layer: group,
      meta: { count },
      setOpacity: (o) => setOp(o),
      dispose: () => { disposed = true; group.clearLayers(); },
    };
  };
}

export const REAL_LAYER_DEFS: LayerDef[] = [
  {
    id: "earthquakes" as never,
    label: "Terremotos (USGS)",
    icon: "🌐",
    category: "ambiental",
    order: 92,
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
          color: c,
          fillColor: c,
          fillOpacity: 0.7,
          weight: 1,
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
    id: "poi_health" as never,
    label: "Saúde (OSM)",
    icon: "🏥",
    category: "urbano",
    order: 52,
    defaultOpacity: 1,
    legend: [
      { color: POI_STYLE.hospital.color, label: "Hospital" },
      { color: POI_STYLE.pharmacy.color, label: "Farmácia" },
    ],
    build: asyncGroup(async (ctx, group) => {
      const [hospitals, pharms] = await Promise.all([
        fetchPois(ctx.bbox, "hospital", 150),
        fetchPois(ctx.bbox, "pharmacy", 150),
      ]);
      const all: Poi[] = [...hospitals, ...pharms];
      const markers: L.Marker[] = [];
      for (const p of all) {
        const style = POI_STYLE[p.kind];
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            html: `<div style="font-size:18px;filter:drop-shadow(0 0 4px ${style.color})">${style.icon}</div>`,
            className: "gis-poi",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).bindPopup(`<b>${p.name}</b><br/>${style.label}<br/>${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`);
        m.addTo(group);
        markers.push(m);
      }
      return {
        count: markers.length,
        setOpacity: (o) => markers.forEach((m) => m.setOpacity(o)),
      };
    }),
  },
  {
    id: "poi_safety" as never,
    label: "Segurança (OSM)",
    icon: "🚓",
    category: "urbano",
    order: 51,
    defaultOpacity: 1,
    legend: [
      { color: POI_STYLE.police.color, label: "Polícia" },
      { color: POI_STYLE.fire_station.color, label: "Bombeiros" },
    ],
    build: asyncGroup(async (ctx, group) => {
      const [police, fire] = await Promise.all([
        fetchPois(ctx.bbox, "police", 100),
        fetchPois(ctx.bbox, "fire_station", 100),
      ]);
      const all: Poi[] = [...police, ...fire];
      const markers: L.Marker[] = [];
      for (const p of all) {
        const style = POI_STYLE[p.kind];
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            html: `<div style="font-size:18px;filter:drop-shadow(0 0 4px ${style.color})">${style.icon}</div>`,
            className: "gis-poi",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).bindPopup(`<b>${p.name}</b><br/>${style.label}`);
        m.addTo(group);
        markers.push(m);
      }
      return {
        count: markers.length,
        setOpacity: (o) => markers.forEach((m) => m.setOpacity(o)),
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
          radius: 6,
          color: c,
          fillColor: c,
          fillOpacity: 0.8,
          weight: 1,
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
];

/** Layer ids that need to be rebuilt whenever the map bbox changes. */
export const BBOX_DRIVEN_LAYERS = new Set(["poi_health", "poi_safety", "air_quality"]);
