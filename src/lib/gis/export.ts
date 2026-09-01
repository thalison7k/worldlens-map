/**
 * Exportação de dados ambientais em múltiplos formatos.
 *
 * Coleta os dados reais da área visível (clima, sismos, queimadas, ar,
 * enchentes, ciclones, ENSO, IoT) e serializa em GeoJSON, CSV, JSON, KML,
 * GPX ou Markdown/TXT. Usado pela barra SIG e pelo Geo AI Assistant.
 */
import { fetchEarthquakes } from "./providers/usgs";
import { fetchAirStations } from "./providers/openaq";
import { fetchWeather } from "./providers/openmeteo";
import { fetchFires } from "./providers/firms";
import { fetchCyclones } from "./providers/cyclones";
import { fetchFloodRisk } from "./providers/floods";
import { fetchEnso } from "./providers/enso";
import { fetchReadings } from "@/lib/iot/cloud";
import type { BBox } from "./simulated";

export const EXPORT_FORMATS = ["geojson", "csv", "json", "kml", "gpx", "md"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_LABEL: Record<ExportFormat, string> = {
  geojson: "GeoJSON",
  csv: "CSV",
  json: "JSON",
  kml: "KML",
  gpx: "GPX",
  md: "Markdown",
};

const MIME: Record<ExportFormat, string> = {
  geojson: "application/geo+json",
  csv: "text/csv;charset=utf-8",
  json: "application/json",
  kml: "application/vnd.google-earth.kml+xml",
  gpx: "application/gpx+xml",
  md: "text/markdown;charset=utf-8",
};

export interface ExportPoint {
  lat: number;
  lng: number;
  layer: string;
  name: string;
  value?: number | string;
  unit?: string;
  time?: string;
  props?: Record<string, unknown>;
}

function ok<T>(p: Promise<T>, fallback: T, ms = 9000): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => resolve(v))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(t));
  });
}

const inBox = (b: BBox, lat: number, lng: number) =>
  lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];

/** Coleta todos os pontos ambientais reais dentro da bbox informada. */
export async function collectExportPoints(bbox: BBox): Promise<ExportPoint[]> {
  const [quakes, air, weather, fires, cyclones, floods, iot] = await Promise.all([
    ok(fetchEarthquakes("day"), [] as Awaited<ReturnType<typeof fetchEarthquakes>>),
    ok(fetchAirStations(bbox, 80), [] as Awaited<ReturnType<typeof fetchAirStations>>),
    ok(fetchWeather(bbox, 16), [] as Awaited<ReturnType<typeof fetchWeather>>),
    ok(fetchFires(bbox, 1), [] as Awaited<ReturnType<typeof fetchFires>>),
    ok(fetchCyclones(), [] as Awaited<ReturnType<typeof fetchCyclones>>),
    ok(fetchFloodRisk(bbox, 3), [] as Awaited<ReturnType<typeof fetchFloodRisk>>),
    ok(fetchReadings(80), [] as Awaited<ReturnType<typeof fetchReadings>>),
  ]);

  const out: ExportPoint[] = [];
  const push = (p: ExportPoint) => {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) out.push(p);
  };

  for (const q of quakes as Array<Record<string, unknown>>) {
    const lat = Number(q.lat), lng = Number(q.lng);
    if (!inBox(bbox, lat, lng)) continue;
    push({
      lat, lng, layer: "earthquakes", name: String(q.place ?? "Sismo"),
      value: Number(q.mag), unit: "M", time: q.time ? new Date(Number(q.time)).toISOString() : undefined,
      props: { depthKm: q.depth, source: "USGS" },
    });
  }
  for (const s of air as Array<Record<string, unknown>>) {
    push({
      lat: Number(s.lat), lng: Number(s.lng), layer: "air_quality",
      name: String(s.name ?? "Estação de ar"), value: Number(s.pm25 ?? s.value ?? NaN),
      unit: "µg/m³ PM2.5", props: { aqi: s.aqi, source: "Open-Meteo/OpenAQ" },
    });
  }
  for (const w of weather as Array<Record<string, unknown>>) {
    push({
      lat: Number(w.lat), lng: Number(w.lng), layer: "weather",
      name: "Leitura meteorológica", value: Number(w.temp ?? NaN), unit: "°C",
      props: { humidity: w.humidity, wind: w.wind, precip: w.precip, source: "Open-Meteo" },
    });
  }
  for (const f of fires as Array<Record<string, unknown>>) {
    push({
      lat: Number(f.lat), lng: Number(f.lng), layer: "fires", name: "Foco de calor",
      value: Number(f.frp ?? NaN), unit: "MW FRP", time: String(f.acq ?? f.time ?? ""),
      props: { confidence: f.confidence, satellite: f.satellite, source: "NASA FIRMS/INPE" },
    });
  }
  for (const c of cyclones as Array<Record<string, unknown>>) {
    const lat = Number(c.lat), lng = Number(c.lng);
    if (!inBox(bbox, lat, lng)) continue;
    push({
      lat, lng, layer: "cyclones", name: String(c.name ?? "Ciclone"),
      value: Number(c.windKt ?? NaN), unit: "kt",
      props: { pressure: c.pressure, basin: c.basin, source: "NOAA NHC/GDACS" },
    });
  }
  for (const f of floods as Array<Record<string, unknown>>) {
    push({
      lat: Number(f.lat), lng: Number(f.lng), layer: "flood_risk", name: "Risco de enchente",
      value: Number(f.score ?? NaN), unit: "0-100",
      props: { level: f.level, precip72h: f.precip72h, source: "Open-Meteo GloFAS" },
    });
  }
  for (const r of iot as Array<Record<string, unknown>>) {
    const lat = Number(r.lat), lng = Number(r.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    push({
      lat, lng, layer: "iot_sensors", name: String(r.device_id ?? "Sensor IoT"),
      value: Number(r.value ?? NaN), unit: String(r.unit ?? ""),
      time: String(r.created_at ?? ""), props: { metric: r.metric, source: "Lovable Cloud" },
    });
  }
  return out;
}

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const xml = (v: unknown) =>
  String(v ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string,
  );

export function serializePoints(points: ExportPoint[], format: ExportFormat, meta: Record<string, unknown> = {}) {
  switch (format) {
    case "geojson":
      return JSON.stringify(
        {
          type: "FeatureCollection",
          properties: { ...meta, exportedAt: new Date().toISOString() },
          features: points.map((p) => ({
            type: "Feature",
            properties: { layer: p.layer, name: p.name, value: p.value, unit: p.unit, time: p.time, ...p.props },
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          })),
        },
        null,
        2,
      );
    case "json":
      return JSON.stringify({ meta: { ...meta, exportedAt: new Date().toISOString() }, points }, null, 2);
    case "csv": {
      const head = "layer,name,lat,lng,value,unit,time,source";
      const rows = points.map((p) =>
        [p.layer, p.name, p.lat, p.lng, p.value ?? "", p.unit ?? "", p.time ?? "", p.props?.source ?? ""]
          .map(esc)
          .join(","),
      );
      return [head, ...rows].join("\n");
    }
    case "kml":
      return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>GeoOS Environmental</name>
${points
  .map(
    (p) => `<Placemark><name>${xml(p.name)}</name><description>${xml(
      `${p.layer} · ${p.value ?? ""} ${p.unit ?? ""} ${p.time ?? ""}`,
    )}</description><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`,
  )
  .join("\n")}
</Document></kml>`;
    case "gpx":
      return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoOS Environmental" xmlns="http://www.topografix.com/GPX/1/1">
${points
  .map(
    (p) =>
      `<wpt lat="${p.lat}" lon="${p.lng}"><name>${xml(p.name)}</name><desc>${xml(
        `${p.layer} ${p.value ?? ""} ${p.unit ?? ""}`,
      )}</desc></wpt>`,
  )
  .join("\n")}
</gpx>`;
    case "md": {
      const head = "| Camada | Local | Lat | Lng | Valor | Fonte |\n|---|---|---|---|---|---|";
      const rows = points.map(
        (p) => `| ${p.layer} | ${p.name} | ${p.lat.toFixed(4)} | ${p.lng.toFixed(4)} | ${p.value ?? "-"} ${p.unit ?? ""} | ${p.props?.source ?? "-"} |`,
      );
      return `# GeoOS Environmental — export\n\n_${new Date().toLocaleString("pt-BR")}_\n\n${head}\n${rows.join("\n")}\n`;
    }
  }
}

export function downloadFile(name: string, body: string, format: ExportFormat) {
  const blob = new Blob([body], { type: MIME[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Exporta os dados ambientais da bbox no formato escolhido. */
export async function exportArea(bbox: BBox, format: ExportFormat, meta: Record<string, unknown> = {}) {
  const points = await collectExportPoints(bbox);
  const body = serializePoints(points, format, { bbox, ...meta });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadFile(`geoos-ambiental-${stamp}.${format}`, body, format);
  return points.length;
}
