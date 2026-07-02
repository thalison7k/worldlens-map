/**
 * Deterministic simulators for GIS layers. Every generator is seeded by
 * bbox + timeframe so pans/zooms produce stable outputs, while the timeline
 * shifts the data window.
 */

export type BBox = [number, number, number, number]; // [w,s,e,n]

export function seeded(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function seedFromBbox(b: BBox, extra = 0): number {
  const [w, s, e, n] = b;
  return Math.floor((w * 73856093) ^ (s * 19349663) ^ (e * 83492791) ^ (n * 2971215073) ^ extra);
}

function inside(b: BBox, rnd: () => number, marginPct = 0.05) {
  const [w, s, e, n] = b;
  const dx = (e - w) * marginPct;
  const dy = (n - s) * marginPct;
  return { lat: s + dy + rnd() * (n - s - 2 * dy), lng: w + dx + rnd() * (e - w - 2 * dx) };
}

function polygonAround(lat: number, lng: number, sizeKm: number, rnd: () => number, sides = 8): [number, number][] {
  const km = sizeKm / 111;
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const r = km * (0.6 + rnd() * 0.6);
    pts.push([lat + Math.sin(a) * r, lng + Math.cos(a) * r / Math.cos((lat * Math.PI) / 180)]);
  }
  return pts;
}

/* ---------- Occurrences (mixed) ---------- */

export type OccurrenceCategory =
  | "iluminacao" | "buraco" | "lixo" | "arvore" | "agua" | "esgoto"
  | "poste" | "sinalizacao" | "ruido" | "vandalismo";

export type Severity = "baixa" | "media" | "alta" | "critica";
export type Status = "aberto" | "em_andamento" | "resolvido";

export type Occurrence = {
  id: string;
  lat: number;
  lng: number;
  category: OccurrenceCategory;
  title: string;
  description: string;
  severity: Severity;
  status: Status;
  neighborhood: string;
  secretaria: string;
  timestamp: number;
  photo: string;
};

const CATEGORIES: { id: OccurrenceCategory; title: string; sec: string }[] = [
  { id: "iluminacao", title: "Iluminação pública apagada", sec: "Iluminação" },
  { id: "buraco", title: "Buraco na via", sec: "Obras" },
  { id: "lixo", title: "Descarte irregular de lixo", sec: "Limpeza Urbana" },
  { id: "arvore", title: "Árvore com risco de queda", sec: "Meio Ambiente" },
  { id: "agua", title: "Vazamento de água", sec: "Saneamento" },
  { id: "esgoto", title: "Esgoto a céu aberto", sec: "Saneamento" },
  { id: "poste", title: "Poste danificado", sec: "Energia" },
  { id: "sinalizacao", title: "Sinalização de trânsito danificada", sec: "Trânsito" },
  { id: "ruido", title: "Perturbação por ruído", sec: "Ordem Pública" },
  { id: "vandalismo", title: "Vandalismo em bem público", sec: "Segurança" },
];

const NEIGHBORHOODS = ["Centro","Jardim das Flores","Vila Nova","Bela Vista","São José","Boa Vista","Alto da Serra","Parque Industrial","Praia Grande","Morumbi","Ipiranga","Santa Cecília","Vila Mariana","Perdizes","Aclimação"];

const SEVERITY_ORDER: Severity[] = ["baixa","media","alta","critica"];
const STATUS_ORDER: Status[] = ["aberto","em_andamento","resolvido"];

export function generateOccurrences(bbox: BBox, timeWindowMs: number, seed = 0): Occurrence[] {
  const rnd = seeded(seedFromBbox(bbox, seed + 11));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(320, Math.max(20, Math.round(120 / Math.sqrt(area) + 30)));
  const now = Date.now();
  const out: Occurrence[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    const cat = CATEGORIES[Math.floor(rnd() * CATEGORIES.length)];
    const severity = SEVERITY_ORDER[Math.floor(rnd() * SEVERITY_ORDER.length)];
    const status = STATUS_ORDER[Math.floor(rnd() * STATUS_ORDER.length)];
    out.push({
      id: `oc-${i}-${Math.floor(rnd() * 1e9).toString(36)}`,
      lat: p.lat, lng: p.lng,
      category: cat.id,
      title: cat.title,
      description: `Registrado por cidadão via app. Aguardando triagem da secretaria de ${cat.sec}.`,
      severity, status,
      neighborhood: NEIGHBORHOODS[Math.floor(rnd() * NEIGHBORHOODS.length)],
      secretaria: cat.sec,
      timestamp: now - Math.floor(rnd() * timeWindowMs),
      photo: `https://picsum.photos/seed/${cat.id}-${i}/320/180`,
    });
  }
  return out;
}

/* ---------- Fires ---------- */

export type Fire = {
  id: string;
  lat: number;
  lng: number;
  brightness: number; // 0..1
  radiusKm: number;
  polygon: [number, number][];
  timestamp: number;
};

export function generateFires(bbox: BBox, timeWindowMs: number): Fire[] {
  const rnd = seeded(seedFromBbox(bbox, 7));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(60, Math.max(8, Math.round(40 / Math.sqrt(area))));
  const now = Date.now();
  const fires: Fire[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    const brightness = 0.25 + rnd() * 0.75;
    const km = 0.4 + brightness * 4 + rnd() * 1.5;
    fires.push({
      id: `fire-${i}`,
      lat: p.lat, lng: p.lng,
      brightness,
      radiusKm: km,
      polygon: polygonAround(p.lat, p.lng, km, rnd, 10),
      timestamp: now - Math.floor(rnd() * timeWindowMs),
    });
  }
  return fires;
}

export function fireColor(brightness: number): string {
  if (brightness > 0.7) return "#dc2626";
  if (brightness > 0.4) return "#f97316";
  return "#facc15";
}

/* ---------- Rain radar cells ---------- */

export type RainCell = {
  lat: number;
  lng: number;
  radiusKm: number;
  intensity: number; // 0..1
  driftLat: number;
  driftLng: number;
};

export function generateRainCells(bbox: BBox, seed = 0): RainCell[] {
  const rnd = seeded(seedFromBbox(bbox, seed + 91));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(30, Math.max(6, Math.round(20 / Math.sqrt(area))));
  const cells: RainCell[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    cells.push({
      lat: p.lat, lng: p.lng,
      radiusKm: 3 + rnd() * 18,
      intensity: 0.3 + rnd() * 0.7,
      driftLat: (rnd() - 0.5) * 0.0006,
      driftLng: (rnd() - 0.3) * 0.0012,
    });
  }
  return cells;
}

export function rainColor(intensity: number): string {
  if (intensity > 0.75) return "#7c3aed";
  if (intensity > 0.55) return "#ef4444";
  if (intensity > 0.4) return "#f59e0b";
  if (intensity > 0.25) return "#22c55e";
  return "#38bdf8";
}

/* ---------- Floods ---------- */

export type Flood = {
  id: string;
  level: "baixo" | "medio" | "alto" | "critico";
  polygon: [number, number][];
  lat: number;
  lng: number;
  waterLevelM: number;
};

export function generateFloods(bbox: BBox): Flood[] {
  const rnd = seeded(seedFromBbox(bbox, 23));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(25, Math.max(5, Math.round(15 / Math.sqrt(area))));
  const levels: Flood["level"][] = ["baixo","medio","alto","critico"];
  const out: Flood[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    const level = levels[Math.floor(rnd() * levels.length)];
    const km = 0.3 + rnd() * 2.5;
    out.push({
      id: `fl-${i}`, level,
      lat: p.lat, lng: p.lng,
      waterLevelM: +(0.2 + rnd() * 2.4).toFixed(2),
      polygon: polygonAround(p.lat, p.lng, km, rnd, 12),
    });
  }
  return out;
}

export function floodColor(level: Flood["level"]): string {
  return level === "critico" ? "#1e3a8a" : level === "alto" ? "#1d4ed8" : level === "medio" ? "#3b82f6" : "#93c5fd";
}

/* ---------- Deforestation (before/after) ---------- */

export type DeforestationArea = {
  id: string;
  polygon: [number, number][];
  lat: number;
  lng: number;
  hectares: number;
  yearBefore: number;
  yearAfter: number;
};

export function generateDeforestation(bbox: BBox): DeforestationArea[] {
  const rnd = seeded(seedFromBbox(bbox, 41));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(15, Math.max(3, Math.round(8 / Math.sqrt(area))));
  const y = new Date().getFullYear();
  const out: DeforestationArea[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    const km = 0.5 + rnd() * 3.5;
    out.push({
      id: `df-${i}`,
      lat: p.lat, lng: p.lng,
      hectares: Math.round(km * km * 100),
      yearBefore: y - 2,
      yearAfter: y,
      polygon: polygonAround(p.lat, p.lng, km, rnd, 9),
    });
  }
  return out;
}

/* ---------- Vegetation (NDVI grid) ---------- */

export type NdviCell = { lat: number; lng: number; sizeLat: number; sizeLng: number; ndvi: number };

export function generateNdviGrid(bbox: BBox, cols = 14, rows = 10): NdviCell[] {
  const rnd = seeded(seedFromBbox(bbox, 61));
  const [w, s, e, n] = bbox;
  const dx = (e - w) / cols;
  const dy = (n - s) / rows;
  const grid: NdviCell[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lat = s + j * dy;
      const lng = w + i * dx;
      // smooth-ish NDVI using multi-octave rnd
      const ndvi = Math.max(0, Math.min(1, 0.35 + (rnd() - 0.5) * 0.9 + Math.sin((i + j) * 0.6) * 0.15));
      grid.push({ lat, lng, sizeLat: dy, sizeLng: dx, ndvi });
    }
  }
  return grid;
}

export function ndviColor(v: number): string {
  if (v > 0.75) return "#166534";
  if (v > 0.55) return "#22c55e";
  if (v > 0.4) return "#84cc16";
  if (v > 0.25) return "#eab308";
  if (v > 0.1) return "#d97706";
  return "#78350f";
}

/* ---------- Environmental air quality points ---------- */

export type AirPoint = { lat: number; lng: number; aqi: number; pm25: number; temp: number; humidity: number; noise: number };

export function generateAirGrid(bbox: BBox): AirPoint[] {
  const rnd = seeded(seedFromBbox(bbox, 83));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(80, Math.max(15, Math.round(50 / Math.sqrt(area))));
  const arr: AirPoint[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    const aqi = Math.round(20 + rnd() * 180);
    arr.push({
      lat: p.lat, lng: p.lng,
      aqi,
      pm25: +(aqi * 0.3 + rnd() * 5).toFixed(1),
      temp: +(18 + rnd() * 18).toFixed(1),
      humidity: Math.round(35 + rnd() * 60),
      noise: Math.round(45 + rnd() * 45),
    });
  }
  return arr;
}

export function aqiColor(v: number): string {
  if (v > 200) return "#7f1d1d";
  if (v > 150) return "#b91c1c";
  if (v > 100) return "#ea580c";
  if (v > 50) return "#eab308";
  return "#22c55e";
}

/* ---------- Climate wind vectors ---------- */

export type WindPoint = { lat: number; lng: number; speed: number; dir: number; pressure: number; feels: number };

export function generateWindGrid(bbox: BBox): WindPoint[] {
  const rnd = seeded(seedFromBbox(bbox, 109));
  const [w, s, e, n] = bbox;
  const cols = 12, rows = 8;
  const dx = (e - w) / cols, dy = (n - s) / rows;
  const arr: WindPoint[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      arr.push({
        lat: s + j * dy + dy / 2,
        lng: w + i * dx + dx / 2,
        speed: +(1 + rnd() * 40).toFixed(1),
        dir: Math.floor(rnd() * 360),
        pressure: Math.round(995 + rnd() * 25),
        feels: +(15 + rnd() * 20).toFixed(1),
      });
    }
  }
  return arr;
}

/* ---------- Sensors ---------- */

export type Sensor = {
  id: string;
  lat: number;
  lng: number;
  type: "temperatura" | "umidade" | "ar" | "ruido" | "nivel_rio" | "solo";
  value: number;
  unit: string;
  battery: number;
  status: "online" | "alerta" | "offline";
  lastUpdate: number;
  history: number[];
};

const SENSOR_TYPES: Sensor["type"][] = ["temperatura","umidade","ar","ruido","nivel_rio","solo"];
const SENSOR_UNITS: Record<Sensor["type"], string> = {
  temperatura: "°C", umidade: "%", ar: "AQI", ruido: "dB", nivel_rio: "m", solo: "%",
};
const SENSOR_RANGE: Record<Sensor["type"], [number, number]> = {
  temperatura: [12, 40], umidade: [20, 95], ar: [15, 220], ruido: [40, 100], nivel_rio: [0.2, 5], solo: [10, 90],
};

export function generateSensors(bbox: BBox): Sensor[] {
  const rnd = seeded(seedFromBbox(bbox, 137));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(40, Math.max(6, Math.round(25 / Math.sqrt(area))));
  const arr: Sensor[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    const t = SENSOR_TYPES[Math.floor(rnd() * SENSOR_TYPES.length)];
    const [lo, hi] = SENSOR_RANGE[t];
    const value = +(lo + rnd() * (hi - lo)).toFixed(2);
    const history = Array.from({ length: 12 }, () => +(lo + rnd() * (hi - lo)).toFixed(2));
    const st = rnd() < 0.08 ? "offline" : rnd() < 0.18 ? "alerta" : "online";
    arr.push({
      id: `S-${(1000 + i).toString(36).toUpperCase()}`,
      lat: p.lat, lng: p.lng,
      type: t, value, unit: SENSOR_UNITS[t],
      battery: Math.round(20 + rnd() * 80),
      status: st,
      lastUpdate: Date.now() - Math.floor(rnd() * 3600_000),
      history,
    });
  }
  return arr;
}

/* ---------- Drones ---------- */

export type Drone = {
  id: string;
  route: [number, number][];
  altitude: number;
  speedKph: number;
  battery: number;
  progress: number; // 0..1 along route
};

export function generateDrones(bbox: BBox): Drone[] {
  const rnd = seeded(seedFromBbox(bbox, 199));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(12, Math.max(3, Math.round(8 / Math.sqrt(area))));
  const arr: Drone[] = [];
  for (let i = 0; i < count; i++) {
    const start = inside(bbox, rnd);
    const route: [number, number][] = [[start.lat, start.lng]];
    for (let j = 0; j < 6; j++) {
      const p = inside(bbox, rnd);
      route.push([p.lat, p.lng]);
    }
    route.push([start.lat, start.lng]);
    arr.push({
      id: `D-${100 + i}`,
      route,
      altitude: Math.round(60 + rnd() * 240),
      speedKph: Math.round(20 + rnd() * 60),
      battery: Math.round(30 + rnd() * 70),
      progress: rnd(),
    });
  }
  return arr;
}

export function interpolateRoute(route: [number, number][], progress: number): { lat: number; lng: number; bearing: number } {
  const total = route.length - 1;
  const seg = Math.min(total - 1, Math.floor(progress * total));
  const local = (progress * total) - seg;
  const [a, b] = [route[seg], route[seg + 1]];
  const lat = a[0] + (b[0] - a[0]) * local;
  const lng = a[1] + (b[1] - a[1]) * local;
  const bearing = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return { lat, lng, bearing };
}

/* ---------- Transport vehicles ---------- */

export type TransportVehicle = {
  id: string;
  kind: "onibus" | "metro" | "trem" | "bike";
  line: string;
  route: [number, number][];
  progress: number;
  speedKph: number;
};

export function generateTransport(bbox: BBox): TransportVehicle[] {
  const rnd = seeded(seedFromBbox(bbox, 251));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(45, Math.max(8, Math.round(30 / Math.sqrt(area))));
  const kinds: TransportVehicle["kind"][] = ["onibus","onibus","onibus","metro","trem","bike","bike"];
  const arr: TransportVehicle[] = [];
  for (let i = 0; i < count; i++) {
    const start = inside(bbox, rnd);
    const end = inside(bbox, rnd);
    const mid = { lat: (start.lat + end.lat) / 2 + (rnd() - 0.5) * (n - s) * 0.1, lng: (start.lng + end.lng) / 2 + (rnd() - 0.5) * (e - w) * 0.1 };
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    arr.push({
      id: `${kind[0].toUpperCase()}-${1000 + i}`,
      kind, line: `${Math.floor(rnd() * 900 + 100)}`,
      route: [[start.lat, start.lng], [mid.lat, mid.lng], [end.lat, end.lng]],
      progress: rnd(),
      speedKph: kind === "bike" ? 15 + Math.round(rnd() * 10) : kind === "onibus" ? 25 + Math.round(rnd() * 20) : 40 + Math.round(rnd() * 40),
    });
  }
  return arr;
}

export const TRANSPORT_COLOR: Record<TransportVehicle["kind"], string> = {
  onibus: "#f59e0b", metro: "#2563eb", trem: "#10b981", bike: "#a855f7",
};

/* ---------- Energy ---------- */

export type Substation = { id: string; lat: number; lng: number; capacityMW: number; loadPct: number; fault: boolean };
export type PowerLine = { from: [number, number]; to: [number, number]; kV: number };

export function generateEnergy(bbox: BBox): { subs: Substation[]; lines: PowerLine[] } {
  const rnd = seeded(seedFromBbox(bbox, 313));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(14, Math.max(3, Math.round(8 / Math.sqrt(area))));
  const subs: Substation[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    subs.push({
      id: `SE-${i + 1}`,
      lat: p.lat, lng: p.lng,
      capacityMW: Math.round(50 + rnd() * 450),
      loadPct: Math.round(30 + rnd() * 70),
      fault: rnd() < 0.15,
    });
  }
  const lines: PowerLine[] = [];
  for (let i = 0; i < subs.length - 1; i++) {
    lines.push({ from: [subs[i].lat, subs[i].lng], to: [subs[i + 1].lat, subs[i + 1].lng], kV: [69, 138, 230, 500][Math.floor(rnd() * 4)] });
  }
  return { subs, lines };
}

/* ---------- Buildings / POIs ---------- */

export type Building = { id: string; lat: number; lng: number; kind: "hospital" | "escola" | "ubs" | "prefeitura" | "shopping" | "mercado"; name: string };

const BUILDING_KINDS: Building["kind"][] = ["hospital","escola","ubs","prefeitura","shopping","mercado"];
const BUILDING_ICONS: Record<Building["kind"], string> = {
  hospital: "🏥", escola: "🏫", ubs: "⚕️", prefeitura: "🏛️", shopping: "🏬", mercado: "🛒",
};

export function generateBuildings(bbox: BBox): Building[] {
  const rnd = seeded(seedFromBbox(bbox, 401));
  const [w, s, e, n] = bbox;
  const area = Math.max(Math.abs((e - w) * (n - s)), 0.0001);
  const count = Math.min(60, Math.max(10, Math.round(35 / Math.sqrt(area))));
  const arr: Building[] = [];
  for (let i = 0; i < count; i++) {
    const p = inside(bbox, rnd);
    const kind = BUILDING_KINDS[Math.floor(rnd() * BUILDING_KINDS.length)];
    arr.push({
      id: `B-${i}`, lat: p.lat, lng: p.lng, kind,
      name: `${labelBuilding(kind)} ${NEIGHBORHOODS[Math.floor(rnd() * NEIGHBORHOODS.length)]}`,
    });
  }
  return arr;
}

export function labelBuilding(k: Building["kind"]): string {
  return { hospital:"Hospital", escola:"Escola", ubs:"UBS", prefeitura:"Prefeitura", shopping:"Shopping", mercado:"Supermercado" }[k];
}
export { BUILDING_ICONS };

/* ---------- Roads (simulated multi-class polylines) ---------- */

export type Road = { klass: "rodovia" | "avenida" | "rua" | "rural"; path: [number, number][] };

export function generateRoads(bbox: BBox): Road[] {
  const rnd = seeded(seedFromBbox(bbox, 503));
  const [w, s, e, n] = bbox;
  const roads: Road[] = [];
  const classes: Road["klass"][] = ["rodovia","avenida","rua","rural"];
  const counts = { rodovia: 3, avenida: 8, rua: 22, rural: 6 };
  for (const klass of classes) {
    const c = counts[klass];
    for (let i = 0; i < c; i++) {
      const start = inside(bbox, rnd);
      const segments = klass === "rua" ? 3 : 5;
      const path: [number, number][] = [[start.lat, start.lng]];
      let lat = start.lat, lng = start.lng;
      for (let j = 0; j < segments; j++) {
        lat += (rnd() - 0.5) * (n - s) * (klass === "rodovia" ? 0.5 : 0.15);
        lng += (rnd() - 0.5) * (e - w) * (klass === "rodovia" ? 0.5 : 0.15);
        path.push([lat, lng]);
      }
      roads.push({ klass, path });
    }
  }
  return roads;
}

export const ROAD_STYLE: Record<Road["klass"], { color: string; weight: number; dash?: string }> = {
  rodovia: { color: "#ef4444", weight: 4 },
  avenida: { color: "#f59e0b", weight: 3 },
  rua: { color: "#e5e7eb", weight: 1.5 },
  rural: { color: "#a3a3a3", weight: 2, dash: "6 4" },
};

/* ---------- Timeframe helpers ---------- */

export function timeframeMs(tf: "today" | "24h" | "7d" | "30d" | "12m"): number {
  switch (tf) {
    case "today":
    case "24h": return 24 * 3600_000;
    case "7d": return 7 * 24 * 3600_000;
    case "30d": return 30 * 24 * 3600_000;
    case "12m": return 365 * 24 * 3600_000;
  }
}
