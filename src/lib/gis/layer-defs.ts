import L from "leaflet";
import {
  BBox, generateOccurrences, generateFires, fireColor, generateRainCells, rainColor,
  generateFloods, floodColor, generateDeforestation, generateNdviGrid, ndviColor,
  generateAirGrid, aqiColor, generateWindGrid, generateSensors, generateDrones,
  interpolateRoute,
  type Occurrence, type Sensor, type Drone, type OccurrenceCategory, type Severity, type Status,
} from "./simulated";


export type Timeframe = "today" | "24h" | "7d" | "30d" | "12m";

export type LayerId =
  | "occurrences" | "fires" | "rain" | "floods" | "deforestation" | "vegetation"
  | "environmental" | "climate" | "sensors" | "drones";

export type LayerCategory = "monitoramento" | "ambiental" | "clima";


export interface LayerDef {
  id: LayerId;
  label: string;
  icon: string;
  category: LayerCategory;
  defaultVisible?: boolean;
  defaultOpacity?: number;
  order: number;
  emitsHeat?: boolean;
  legend: { color: string; label: string }[];
  build(ctx: BuildCtx): BuiltLayer;
}

export interface BuildCtx {
  map: L.Map;
  bbox: BBox;
  timeframe: Timeframe;
  filters: OccurrenceFilters;
}

export type OccurrenceFilters = {
  category: OccurrenceCategory | "all";
  severity: Severity | "all";
  status: Status | "all";
  secretaria: string | "all";
  query: string;
};

export interface BuiltLayer {
  layer: L.Layer;
  heatPoints?: [number, number, number][];
  setOpacity: (o: number) => void;
  tick?: (deltaMs: number) => void;
  dispose: () => void;
  meta?: { count: number };
}

/* ---------- Utility ---------- */

function timeframeMs(tf: Timeframe): number {
  switch (tf) {
    case "today":
    case "24h": return 24 * 3600_000;
    case "7d": return 7 * 24 * 3600_000;
    case "30d": return 30 * 24 * 3600_000;
    case "12m": return 365 * 24 * 3600_000;
  }
}

function pill(color: string, label: string) {
  return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${color}22;color:${color};font-size:11px;border:1px solid ${color}55">${label}</span>`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s atrás`;
  if (s < 3600) return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return `${Math.floor(s / 86400)}d atrás`;
}

const SEV_COLOR: Record<Severity, string> = {
  baixa: "#22c55e", media: "#eab308", alta: "#f97316", critica: "#dc2626",
};
const STATUS_COLOR: Record<Status, string> = {
  aberto: "#ef4444", em_andamento: "#f59e0b", resolvido: "#22c55e",
};
const STATUS_LABEL: Record<Status, string> = {
  aberto: "Aberto", em_andamento: "Em andamento", resolvido: "Resolvido",
};

function occurrencePopup(o: Occurrence): string {
  return `
  <div style="width:260px;font-family:inherit">
    <img src="${o.photo}" alt="" style="width:100%;height:130px;object-fit:cover;border-radius:8px;margin-bottom:8px" loading="lazy"/>
    <div style="font-weight:600;font-size:13px;margin-bottom:4px">${o.title}</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
      ${pill(SEV_COLOR[o.severity], `Gravidade ${o.severity}`)}
      ${pill(STATUS_COLOR[o.status], STATUS_LABEL[o.status])}
    </div>
    <div style="font-size:11px;color:#94a3b8;line-height:1.5">${o.description}</div>
    <hr style="border:none;border-top:1px solid #ffffff15;margin:8px 0"/>
    <div style="font-size:11px;line-height:1.6">
      <div><b>Bairro:</b> ${o.neighborhood}</div>
      <div><b>Secretaria:</b> ${o.secretaria}</div>
      <div><b>Data:</b> ${new Date(o.timestamp).toLocaleString()}</div>
      <div><b>Coordenadas:</b> ${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}</div>
    </div>
  </div>`;
}

function filterOccurrences(list: Occurrence[], f: OccurrenceFilters): Occurrence[] {
  const q = f.query.trim().toLowerCase();
  return list.filter((o) => {
    if (f.category !== "all" && o.category !== f.category) return false;
    if (f.severity !== "all" && o.severity !== f.severity) return false;
    if (f.status !== "all" && o.status !== f.status) return false;
    if (f.secretaria !== "all" && o.secretaria !== f.secretaria) return false;
    if (q && !(`${o.title} ${o.neighborhood} ${o.description}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

/* ---------- Layer definitions ---------- */

export const LAYER_DEFS: LayerDef[] = [
  {
    id: "occurrences", label: "Ocorrências", icon: "📍", category: "monitoramento",
    order: 90, emitsHeat: true, defaultVisible: true, defaultOpacity: 1,
    legend: [
      { color: SEV_COLOR.baixa, label: "Baixa" },
      { color: SEV_COLOR.media, label: "Média" },
      { color: SEV_COLOR.alta, label: "Alta" },
      { color: SEV_COLOR.critica, label: "Crítica" },
    ],
    build: (ctx) => {
      const raw = generateOccurrences(ctx.bbox, timeframeMs(ctx.timeframe));
      const list = filterOccurrences(raw, ctx.filters);
      const group = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false });
      for (const o of list) {
        const m = L.circleMarker([o.lat, o.lng], {
          radius: o.severity === "critica" ? 9 : o.severity === "alta" ? 7 : o.severity === "media" ? 6 : 5,
          color: SEV_COLOR[o.severity], fillColor: SEV_COLOR[o.severity], fillOpacity: 0.85, weight: 1,
        }).bindPopup(occurrencePopup(o), { maxWidth: 300 });
        group.addLayer(m);
      }
      return {
        layer: group, meta: { count: list.length },
        heatPoints: list.map((o) => [o.lat, o.lng, 0.3 + (["baixa","media","alta","critica"].indexOf(o.severity) + 1) * 0.15]),
        setOpacity: () => { /* cluster respects marker opacity */ },
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "fires", label: "Queimadas", icon: "🔥", category: "monitoramento",
    order: 80, emitsHeat: true, defaultVisible: true, defaultOpacity: 0.85,
    legend: [
      { color: "#facc15", label: "Baixa" },
      { color: "#f97316", label: "Média" },
      { color: "#dc2626", label: "Alta" },
    ],
    build: (ctx) => {
      const fires = generateFires(ctx.bbox, timeframeMs(ctx.timeframe));
      const group = L.layerGroup();
      for (const f of fires) {
        const c = fireColor(f.brightness);
        L.polygon(f.polygon, { color: c, fillColor: c, fillOpacity: 0.35, weight: 1 })
          .bindPopup(`<b>🔥 Foco de queimada</b><br/>Brilho: ${(f.brightness * 100).toFixed(0)}%<br/>Raio: ${f.radiusKm.toFixed(1)} km<br/>${timeAgo(f.timestamp)}`)
          .addTo(group);
        L.circleMarker([f.lat, f.lng], { radius: 4 + f.brightness * 6, color: c, fillColor: c, fillOpacity: 0.9, weight: 0 }).addTo(group);
      }
      return {
        layer: group, meta: { count: fires.length },
        heatPoints: fires.map((f) => [f.lat, f.lng, f.brightness]),
        setOpacity: (o) => group.eachLayer((l) => (l as L.Path).setStyle?.({ opacity: o, fillOpacity: o * 0.4 })),
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "rain", label: "Chuvas (radar)", icon: "🌧️", category: "clima",
    order: 70, emitsHeat: false, defaultOpacity: 0.55,
    legend: [
      { color: "#38bdf8", label: "Leve" },
      { color: "#22c55e", label: "Moderada" },
      { color: "#f59e0b", label: "Forte" },
      { color: "#ef4444", label: "Intensa" },
      { color: "#7c3aed", label: "Torrencial" },
    ],
    build: (ctx) => {
      const cells = generateRainCells(ctx.bbox);
      const group = L.layerGroup();
      const circles: { c: L.Circle; cell: (typeof cells)[number] }[] = [];
      for (const cell of cells) {
        const c = L.circle([cell.lat, cell.lng], {
          radius: cell.radiusKm * 1000,
          color: rainColor(cell.intensity),
          fillColor: rainColor(cell.intensity),
          fillOpacity: 0.35 * cell.intensity,
          weight: 1,
        }).bindPopup(`<b>☔ Célula de chuva</b><br/>Intensidade: ${(cell.intensity * 100).toFixed(0)}%<br/>Raio: ${cell.radiusKm.toFixed(1)} km`);
        c.addTo(group);
        circles.push({ c, cell });
      }
      return {
        layer: group, meta: { count: cells.length },
        setOpacity: (o) => circles.forEach(({ c, cell }) => c.setStyle({ opacity: o, fillOpacity: 0.35 * cell.intensity * o })),
        tick: (dt) => {
          const secs = dt / 1000;
          for (const { c, cell } of circles) {
            cell.lat += cell.driftLat * secs * 60;
            cell.lng += cell.driftLng * secs * 60;
            cell.intensity = Math.max(0.15, Math.min(1, cell.intensity + (Math.sin(Date.now() / 4000 + cell.lat) * 0.005)));
            c.setLatLng([cell.lat, cell.lng]);
            c.setStyle({ color: rainColor(cell.intensity), fillColor: rainColor(cell.intensity) });
          }
        },
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "floods", label: "Enchentes", icon: "🌊", category: "monitoramento",
    order: 60, emitsHeat: true, defaultOpacity: 0.6,
    legend: [
      { color: "#93c5fd", label: "Baixo" },
      { color: "#3b82f6", label: "Médio" },
      { color: "#1d4ed8", label: "Alto" },
      { color: "#1e3a8a", label: "Crítico" },
    ],
    build: (ctx) => {
      const floods = generateFloods(ctx.bbox);
      const group = L.layerGroup();
      for (const f of floods) {
        const c = floodColor(f.level);
        L.polygon(f.polygon, { color: c, fillColor: c, fillOpacity: 0.4, weight: 1 })
          .bindPopup(`<b>🌊 Área inundada</b><br/>Nível: <b>${f.level.toUpperCase()}</b><br/>Lâmina d'água: ${f.waterLevelM} m`)
          .addTo(group);
      }
      const levelWeight: Record<string, number> = { baixo: 0.3, medio: 0.55, alto: 0.8, critico: 1 };
      return {
        layer: group, meta: { count: floods.length },
        heatPoints: floods.map((f) => [f.lat, f.lng, levelWeight[f.level]]),
        setOpacity: (o) => group.eachLayer((l) => (l as L.Path).setStyle?.({ opacity: o, fillOpacity: 0.4 * o })),
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "deforestation", label: "Desmatamento", icon: "🪓", category: "ambiental",
    order: 55, emitsHeat: true, defaultOpacity: 0.7,
    legend: [{ color: "#a16207", label: "Área desmatada" }, { color: "#166534", label: "Área anterior" }],
    build: (ctx) => {
      const areas = generateDeforestation(ctx.bbox);
      const group = L.layerGroup();
      const shells: { p: L.Polygon; before: boolean }[] = [];
      for (const a of areas) {
        const before = L.polygon(a.polygon, { color: "#166534", fillColor: "#166534", fillOpacity: 0.35, weight: 1 }).addTo(group);
        const after = L.polygon(a.polygon, { color: "#a16207", fillColor: "#a16207", fillOpacity: 0.6, weight: 1, dashArray: "4 3" })
          .bindPopup(`<b>🪓 Desmatamento</b><br/>${a.hectares} ha<br/>${a.yearBefore} → ${a.yearAfter}`)
          .addTo(group);
        shells.push({ p: before, before: true }, { p: after, before: false });
      }
      let phase = 0;
      return {
        layer: group, meta: { count: areas.length },
        heatPoints: areas.map((a) => [a.lat, a.lng, 0.7]),
        setOpacity: (o) => shells.forEach(({ p, before }) => p.setStyle({ opacity: o, fillOpacity: (before ? 0.35 : 0.6) * o })),
        tick: (dt) => {
          phase = (phase + dt / 3000) % 2;
          const showAfter = phase >= 1;
          shells.forEach(({ p, before }) => {
            const el = (p as L.Polygon & { _path?: SVGElement })._path;
            if (el) el.style.opacity = String((before ? !showAfter : showAfter) ? 1 : 0);
          });
        },
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "vegetation", label: "Vegetação (NDVI)", icon: "🌿", category: "ambiental",
    order: 20, emitsHeat: false, defaultOpacity: 0.55,
    legend: [
      { color: "#166534", label: "Densa" },
      { color: "#22c55e", label: "Média" },
      { color: "#eab308", label: "Escassa" },
      { color: "#78350f", label: "Solo exposto" },
    ],
    build: (ctx) => {
      const grid = generateNdviGrid(ctx.bbox);
      const group = L.layerGroup();
      for (const g of grid) {
        const c = ndviColor(g.ndvi);
        L.rectangle([[g.lat, g.lng], [g.lat + g.sizeLat, g.lng + g.sizeLng]], {
          color: c, fillColor: c, fillOpacity: 0.35, weight: 0, interactive: false,
        }).addTo(group);
      }
      return {
        layer: group, meta: { count: grid.length },
        setOpacity: (o) => group.eachLayer((l) => (l as L.Path).setStyle?.({ fillOpacity: 0.35 * o })),
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "environmental", label: "Ambiental (ar/ruído)", icon: "🫁", category: "ambiental",
    order: 45, emitsHeat: true, defaultOpacity: 0.8,
    legend: [
      { color: "#22c55e", label: "Bom" }, { color: "#eab308", label: "Moderado" },
      { color: "#ea580c", label: "Ruim" }, { color: "#b91c1c", label: "Muito ruim" }, { color: "#7f1d1d", label: "Perigoso" },
    ],
    build: (ctx) => {
      const points = generateAirGrid(ctx.bbox);
      const group = L.layerGroup();
      for (const p of points) {
        const c = aqiColor(p.aqi);
        L.circleMarker([p.lat, p.lng], { radius: 6, color: c, fillColor: c, fillOpacity: 0.75, weight: 0 })
          .bindPopup(`<b>Qualidade ambiental</b><br/>AQI: ${p.aqi}<br/>PM2.5: ${p.pm25} µg/m³<br/>Temp: ${p.temp}°C · Umid: ${p.humidity}%<br/>Ruído: ${p.noise} dB`)
          .addTo(group);
      }
      return {
        layer: group, meta: { count: points.length },
        heatPoints: points.map((p) => [p.lat, p.lng, Math.min(1, p.aqi / 200)]),
        setOpacity: (o) => group.eachLayer((l) => (l as L.Path).setStyle?.({ fillOpacity: 0.75 * o })),
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "climate", label: "Climática (vento)", icon: "💨", category: "clima",
    order: 40, defaultOpacity: 0.9,
    legend: [{ color: "#38bdf8", label: "Vetor de vento" }],
    build: (ctx) => {
      const points = generateWindGrid(ctx.bbox);
      const group = L.layerGroup();
      const arrows: L.Marker[] = [];
      for (const p of points) {
        const size = Math.min(28, 10 + p.speed * 0.5);
        const html = `<div style="transform:rotate(${p.dir}deg);color:#38bdf8;font-size:${size}px;line-height:1">➤</div>`;
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html, className: "gis-wind", iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        }).bindPopup(`<b>Clima</b><br/>Vento: ${p.speed} km/h @ ${p.dir}°<br/>Pressão: ${p.pressure} hPa<br/>Sensação: ${p.feels}°C`);
        m.addTo(group); arrows.push(m);
      }
      return {
        layer: group, meta: { count: points.length },
        setOpacity: (o) => arrows.forEach((a) => a.setOpacity(o)),
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "sensors", label: "Sensores IoT", icon: "📡", category: "monitoramento",
    order: 75, defaultOpacity: 1,
    legend: [{ color: "#10b981", label: "Online" }, { color: "#f59e0b", label: "Alerta" }, { color: "#6b7280", label: "Offline" }],
    build: (ctx) => {
      const sensors = generateSensors(ctx.bbox);
      const group = L.layerGroup();
      const markers: { m: L.CircleMarker; s: Sensor }[] = [];
      for (const s of sensors) {
        const color = s.status === "online" ? "#10b981" : s.status === "alerta" ? "#f59e0b" : "#6b7280";
        const m = L.circleMarker([s.lat, s.lng], { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 2 });
        const spark = s.history.map((v, i) => `<rect x="${i * 8}" y="${30 - (v / Math.max(...s.history)) * 28}" width="6" height="${(v / Math.max(...s.history)) * 28}" fill="${color}"/>`).join("");
        m.bindPopup(`
          <div style="width:220px">
            <div style="font-weight:600">Sensor ${s.id} · ${s.type}</div>
            <div style="font-size:24px;font-weight:700;color:${color}">${s.value} <span style="font-size:12px">${s.unit}</span></div>
            <div style="font-size:11px;color:#94a3b8">Status: <b style="color:${color}">${s.status}</b> · Bateria: ${s.battery}%</div>
            <div style="font-size:11px;color:#94a3b8">Atualizado ${timeAgo(s.lastUpdate)}</div>
            <svg width="100%" height="30" viewBox="0 0 ${s.history.length * 8} 30" style="margin-top:6px;background:#00000030;border-radius:4px">${spark}</svg>
          </div>`);
        m.addTo(group);
        markers.push({ m, s });
      }
      return {
        layer: group, meta: { count: sensors.length },
        setOpacity: (o) => markers.forEach(({ m }) => m.setStyle({ opacity: o, fillOpacity: 0.85 * o })),
        tick: (dt) => {
          for (const { m, s } of markers) {
            if (s.status === "offline") continue;
            const jitter = (Math.random() - 0.5) * (dt / 1000) * 0.5;
            s.value = Math.max(0, +(s.value + jitter).toFixed(2));
            s.lastUpdate = Date.now();
            const el = (m as L.CircleMarker & { _path?: SVGElement })._path;
            if (el && s.status === "alerta") el.style.filter = `drop-shadow(0 0 ${4 + Math.sin(Date.now() / 300) * 3}px #f59e0b)`;
          }
        },
        dispose: () => group.clearLayers(),
      };
    },
  },
  {
    id: "drones", label: "Drones", icon: "🛸", category: "monitoramento",
    order: 85, defaultOpacity: 1,
    legend: [{ color: "#22d3ee", label: "Drone em rota" }],
    build: (ctx) => {
      const drones = generateDrones(ctx.bbox);
      const group = L.layerGroup();
      const items: { m: L.Marker; d: Drone; poly: L.Polyline }[] = [];
      for (const d of drones) {
        L.polyline(d.route, { color: "#22d3ee66", weight: 1, dashArray: "4 4" }).addTo(group);
        const pos = interpolateRoute(d.route, d.progress);
        const icon = L.divIcon({
          html: `<div style="font-size:20px;transform:rotate(${pos.bearing}deg);filter:drop-shadow(0 0 6px #22d3ee)">🛸</div>`,
          className: "gis-drone", iconSize: [24, 24], iconAnchor: [12, 12],
        });
        const m = L.marker([pos.lat, pos.lng], { icon })
          .bindPopup(`<b>Drone ${d.id}</b><br/>Altitude: ${d.altitude} m<br/>Velocidade: ${d.speedKph} km/h<br/>Bateria: ${d.battery}%`);
        m.addTo(group);
        const poly = L.polyline(d.route, { opacity: 0, weight: 0 });
        items.push({ m, d, poly });
      }
      return {
        layer: group, meta: { count: drones.length },
        setOpacity: (o) => items.forEach(({ m }) => m.setOpacity(o)),
        tick: (dt) => {
          for (const it of items) {
            it.d.progress = (it.d.progress + (dt / 1000) * (it.d.speedKph / 3600) / 5) % 1;
            const pos = interpolateRoute(it.d.route, it.d.progress);
            it.m.setLatLng([pos.lat, pos.lng]);
            const el = (it.m.getElement() as HTMLElement | null)?.querySelector("div") as HTMLElement | null;
            if (el) el.style.transform = `rotate(${pos.bearing}deg)`;
          }
        },
        dispose: () => group.clearLayers(),
      };
    },
  },
];


export const LAYERS_BY_ID: Record<LayerId, LayerDef> = Object.fromEntries(LAYER_DEFS.map((d) => [d.id, d])) as Record<LayerId, LayerDef>;
export const CATEGORY_LABEL: Record<LayerCategory, string> = {
  monitoramento: "Monitoramento", ambiental: "Ambiental", clima: "Clima",
};


export { SEV_COLOR, STATUS_COLOR, STATUS_LABEL };
