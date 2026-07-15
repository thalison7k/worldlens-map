import L from "leaflet";
import { fetchEarthquakes, magColor } from "./providers/usgs";
import { fetchPois, POI_STYLE, type Poi } from "./providers/overpass";
import { fetchAirStations, pm25Color } from "./providers/openaq";
import { fetchPlanes, type Plane } from "./providers/opensky";
import { fetchBusStops } from "./providers/buses";
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
  {
    id: "planes" as never,
    label: "Aviões (OpenSky) — tempo real",
    icon: "✈️",
    category: "urbano",
    order: 90,
    defaultOpacity: 1,
    legend: [
      { color: "#38bdf8", label: "Em voo" },
      { color: "#94a3b8", label: "No solo" },
    ],
    build: (ctx) => {
      const group = L.layerGroup();
      const markers = new Map<string, L.Marker>();
      let disposed = false;
      let inFlight = false;

      const planeIcon = (p: Plane) => {
        const color = p.onGround ? "#94a3b8" : "#38bdf8";
        return L.divIcon({
          html: `<div style="transform:rotate(${p.heading}deg);color:${color};font-size:18px;line-height:18px;filter:drop-shadow(0 0 6px ${color}88)">✈</div>`,
          className: "gis-plane",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
      };

      const refresh = async () => {
        if (disposed || inFlight) return;
        inFlight = true;
        try {
          const b = ctx.map.getBounds();
          const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
          const spanLat = b.getNorth() - b.getSouth();
          const spanLng = b.getEast() - b.getWest();
          // OpenSky rejects huge bboxes with 400 — skip until zoomed in.
          if (spanLat > 20 || spanLng > 40) return;
          const planes = await fetchPlanes(bbox, 8_000);
          if (disposed) return;
          const seen = new Set<string>();
          for (const p of planes) {
            seen.add(p.icao);
            const existing = markers.get(p.icao);
            if (existing) {
              existing.setLatLng([p.lat, p.lng]);
              existing.setIcon(planeIcon(p));
            } else {
              const m = L.marker([p.lat, p.lng], { icon: planeIcon(p), riseOnHover: true }).bindPopup(
                `<b>${p.callsign}</b> · ${p.country}<br/>Alt: ${Math.round(p.altitude)} m<br/>Vel: ${(p.velocity * 3.6).toFixed(0)} km/h<br/>Hdg: ${Math.round(p.heading)}°<br/><span style="color:#64748b">ICAO ${p.icao}</span>`,
              );
              m.addTo(group);
              markers.set(p.icao, m);
            }
          }
          // remove stale
          for (const [icao, m] of markers) {
            if (!seen.has(icao)) { group.removeLayer(m); markers.delete(icao); }
          }
        } catch { /* silent */ }
        finally { inFlight = false; }
      };

      void refresh();
      const iv = window.setInterval(refresh, 10_000);

      return {
        layer: group,
        meta: { count: 0 },
        setOpacity: (o) => markers.forEach((m) => m.setOpacity(o)),
        dispose: () => { disposed = true; clearInterval(iv); group.clearLayers(); markers.clear(); },
      };
    },
  },
  {
    id: "bus_stops" as never,
    label: "Ônibus / paradas urbanas (OSM)",
    icon: "🚌",
    category: "urbano",
    order: 50,
    defaultOpacity: 1,
    legend: [{ color: "#f59e0b", label: "Parada de ônibus" }],
    build: asyncGroup(async (ctx, group) => {
      const stops = await fetchBusStops(ctx.bbox, 300);
      const markers: L.Marker[] = [];
      for (const s of stops) {
        const m = L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            html: `<div style="font-size:16px;filter:drop-shadow(0 0 4px #f59e0b)">🚌</div>`,
            className: "gis-poi",
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
        }).bindPopup(
          `<b>${s.name}</b>${s.ref ? `<br/>Linha: ${s.ref}` : ""}${s.operator ? `<br/>Operador: ${s.operator}` : ""}`,
        );
        m.addTo(group);
        markers.push(m);
      }
      return {
        count: markers.length,
        setOpacity: (o) => markers.forEach((m) => m.setOpacity(o)),
      };
    }),
  },
];

/** Layer ids that need to be rebuilt whenever the map bbox changes. */
export const BBOX_DRIVEN_LAYERS = new Set(["poi_health", "poi_safety", "air_quality", "bus_stops"]);

/** Layers that manage their own realtime refresh and should NOT be rebuilt on bbox change. */
export const SELF_REFRESHING_LAYERS = new Set(["planes"]);

