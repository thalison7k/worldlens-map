import { fetchEarthquakes } from "./providers/usgs";
import { fetchAirStations } from "./providers/openaq";
import { fetchWeather } from "./providers/openmeteo";
import { fetchFires } from "./providers/firms";
import { fetchEnso, ensoLabel } from "./providers/enso";
import { fetchReadings } from "@/lib/iot/cloud";
import type { BBox } from "./simulated";

export type GeoContextInput = {
  bbox: BBox;
  center: { lat: number; lng: number };
  zoom: number;
  activeLayers: { id: string; label: string; count: number }[];
};

/** Timeout curto por provedor — nenhuma fonte pode travar a montagem do contexto. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => {
      clearTimeout(t);
      console.warn("[GeoContext] fonte indisponível:", e);
      resolve(fallback);
    });
  });
}

const inBox = (b: BBox, lat: number, lng: number) =>
  lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "n/d");

/**
 * Monta um dossiê textual dos dados REAIS atualmente carregados para a área
 * visível do mapa. É esse texto — e apenas ele — que a IA recebe como base
 * factual, garantindo respostas ancoradas na aplicação e não em alucinações.
 */
export async function buildGeoContext(input: GeoContextInput): Promise<string> {
  const { bbox, center, zoom, activeLayers } = input;
  const active = new Set(activeLayers.map((l) => l.id));

  const [quakesAll, air, weather, fires, enso, iot] = await Promise.all([
    withTimeout(fetchEarthquakes("day"), 8000, []),
    active.has("air_quality") ? withTimeout(fetchAirStations(bbox, 60), 8000, []) : Promise.resolve([]),
    active.has("weather") || active.has("rain_radar")
      ? withTimeout(fetchWeather(bbox, 16), 9000, [])
      : Promise.resolve([]),
    active.has("fires") ? withTimeout(fetchFires(bbox, 1), 9000, []) : Promise.resolve([]),
    active.has("el_nino") ? withTimeout(fetchEnso(), 6000, null) : Promise.resolve(null),
    active.has("iot_sensors") ? withTimeout(fetchReadings(60), 6000, []) : Promise.resolve([]),
  ]);

  const quakes = quakesAll.filter((q) => inBox(bbox, q.lat, q.lng));
  const L: string[] = [];

  L.push("### CONTEXTO ESPACIAL");
  L.push(`Centro do mapa: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)} · zoom ${zoom}`);
  L.push(`BBox visível: W ${fmt(bbox[0], 3)} / S ${fmt(bbox[1], 3)} / E ${fmt(bbox[2], 3)} / N ${fmt(bbox[3], 3)}`);
  L.push(
    `Camadas ativas (${activeLayers.length}): ${
      activeLayers.map((l) => `${l.label} [${l.count} feições]`).join("; ") || "nenhuma"
    }`,
  );
  L.push(`Timestamp da coleta: ${new Date().toISOString()}`);

  L.push("\n### DADOS CARREGADOS NA ÁREA VISÍVEL");

  // Clima
  if (weather.length) {
    const temps = weather.map((w) => w.temp);
    const winds = weather.map((w) => w.windSpeed);
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    L.push(`\n[CLIMA · Open-Meteo] ${weather.length} pontos`);
    L.push(
      `Temperatura: média ${fmt(avg(temps))} °C (mín ${fmt(Math.min(...temps))} / máx ${fmt(Math.max(...temps))}). ` +
        `Vento: média ${fmt(avg(winds))} km/h, rajada máx ${fmt(Math.max(...weather.map((w) => w.gust)))} km/h. ` +
        `Umidade média ${fmt(avg(weather.map((w) => w.humidity)), 0)}%. ` +
        `Chuva agora (máx) ${fmt(Math.max(...weather.map((w) => w.precipitation)))} mm/h. ` +
        `UV máx ${fmt(Math.max(...weather.map((w) => w.uv)))}.`,
    );
    for (const w of weather.slice(0, 10)) {
      L.push(
        `- ${w.city}: ${fmt(w.temp)} °C (sensação ${fmt(w.feels)}), umid ${w.humidity}%, ` +
          `vento ${fmt(w.windSpeed)} km/h de ${w.windDir}°, nuvens ${w.cloud}%, chuva ${fmt(w.precipitation)} mm/h`,
      );
    }
  } else L.push("\n[CLIMA] camada inativa ou sem pontos na área visível.");

  // Qualidade do ar
  if (air.length) {
    const vals = air.map((a) => a.value);
    const worst = [...air].sort((a, b) => b.value - a.value).slice(0, 8);
    L.push(`\n[QUALIDADE DO AR · CAMS/Open-Meteo] ${air.length} estações`);
    L.push(
      `PM2.5: média ${fmt(vals.reduce((s, v) => s + v, 0) / vals.length)} µg/m³, máx ${fmt(Math.max(...vals))} µg/m³.`,
    );
    for (const a of worst) {
      L.push(
        `- ${a.city}, ${a.country}: PM2.5 ${fmt(a.value)} ${a.unit}` +
          `${a.pm10 != null ? `, PM10 ${fmt(a.pm10)}` : ""}${a.aqi != null ? `, AQI ${a.aqi}` : ""}` +
          `${a.o3 != null ? `, O3 ${fmt(a.o3)}` : ""}${a.no2 != null ? `, NO2 ${fmt(a.no2)}` : ""}`,
      );
    }
  } else L.push("\n[QUALIDADE DO AR] camada inativa ou sem estações na área visível.");

  // Queimadas
  if (fires.length) {
    const frps = fires.map((f) => f.frp);
    const top = [...fires].sort((a, b) => b.frp - a.frp).slice(0, 8);
    L.push(`\n[QUEIMADAS · INPE/NASA FIRMS · 24h] ${fires.length} focos ativos`);
    L.push(
      `FRP total ${fmt(frps.reduce((s, v) => s + v, 0))} MW, máx ${fmt(Math.max(...frps))} MW, média ${fmt(
        frps.reduce((s, v) => s + v, 0) / frps.length,
      )} MW.`,
    );
    for (const f of top) {
      L.push(
        `- foco ${f.lat.toFixed(3)}, ${f.lng.toFixed(3)} · FRP ${fmt(f.frp)} MW · brilho ${fmt(f.brightness)} K · ` +
          `conf ${f.confidence} · ${f.satellite} · ${f.date} ${f.time} UTC`,
      );
    }
  } else L.push("\n[QUEIMADAS] camada inativa ou sem focos na área visível.");

  // Terremotos
  if (quakes.length) {
    const top = [...quakes].sort((a, b) => b.mag - a.mag).slice(0, 6);
    L.push(`\n[SISMOS · USGS · 24h] ${quakes.length} eventos na área visível`);
    for (const q of top) {
      L.push(
        `- M ${fmt(q.mag)} · ${q.place} · prof ${fmt(q.depthKm)} km · ${new Date(q.time).toISOString()}`,
      );
    }
  } else L.push("\n[SISMOS] nenhum evento USGS nas últimas 24h dentro da área visível.");

  // ENSO
  if (enso) {
    L.push(
      `\n[ENSO · NOAA CPC] fase ${ensoLabel(enso.phase)}` +
        (enso.latest
          ? ` · anomalia SST Niño 3.4 ${fmt(enso.latest.anom, 2)} °C (${enso.latest.year}-${String(
              enso.latest.month,
            ).padStart(2, "0")})`
          : " · sem leitura recente"),
    );
  }

  // IoT
  if (iot.length) {
    const here = iot.filter((r) => inBox(bbox, r.lat, r.lng));
    L.push(`\n[SENSORES IoT · banco na nuvem] ${iot.length} leituras recentes (${here.length} na área visível)`);
    for (const r of here.slice(0, 8)) {
      L.push(
        `- ${r.device_label || "dispositivo"} (${r.device_kind}) em ${r.lat.toFixed(3)}, ${r.lng.toFixed(3)}` +
          `${r.temperature_c != null ? ` · ${fmt(r.temperature_c)} °C` : ""}` +
          `${r.battery_pct != null ? ` · bateria ${r.battery_pct}%` : ""}` +
          `${r.network_type ? ` · rede ${r.network_type}` : ""} · ${new Date(r.created_at).toISOString()}`,
      );
    }
  }

  // Camadas raster sem feições vetoriais
  if (active.has("ndvi")) L.push("\n[NDVI · NASA GIBS] raster de vegetação MODIS 8 dias ativo sobre a área visível.");
  if (active.has("rain_radar"))
    L.push("[RADAR DE CHUVA · RainViewer] mosaico de precipitação + nuvens IR + setas de vento ativo.");

  return L.join("\n");
}
