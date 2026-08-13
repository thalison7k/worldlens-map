import { fetchEarthquakes } from "./providers/usgs";
import { fetchAirStations } from "./providers/openaq";
import { fetchWeather } from "./providers/openmeteo";
import { fetchFires } from "./providers/firms";
import { fetchEnso, ensoLabel } from "./providers/enso";
import { fetchCyclones, cycloneCategory, stormKind } from "./providers/cyclones";
import { fetchFloodRisk, FLOOD_LEVEL_LABEL } from "./providers/floods";
import { reverseGeocode } from "./geocoding";
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

/** Distância aproximada em km (Haversine). */
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Item mais próximo do centro do mapa, com a distância em km. */
function nearest<T extends { lat: number; lng: number }>(
  items: T[],
  center: { lat: number; lng: number },
): { item: T; km: number } | null {
  let best: { item: T; km: number } | null = null;
  for (const item of items) {
    const km = distKm(center, item);
    if (!best || km < best.km) best = { item, km };
  }
  return best;
}

/** Cache curto do dossiê — evita refazer 6 fetches em perguntas sequenciais. */
const CTX_TTL_MS = 60_000;
let ctxCache: { key: string; ts: number; value: string } | null = null;

/**
 * Monta um dossiê textual dos dados REAIS atualmente carregados para a área
 * visível do mapa. É esse texto — e apenas ele — que a IA recebe como base
 * factual, garantindo respostas ancoradas na aplicação e não em alucinações.
 */
export async function buildGeoContext(input: GeoContextInput): Promise<string> {
  const cacheKey = JSON.stringify([
    input.bbox.map((n) => n.toFixed(2)),
    input.zoom,
    input.activeLayers.map((l) => l.id).sort(),
  ]);
  if (ctxCache && ctxCache.key === cacheKey && Date.now() - ctxCache.ts < CTX_TTL_MS) {
    return ctxCache.value;
  }
  const built = await buildGeoContextUncached(input);
  ctxCache = { key: cacheKey, ts: Date.now(), value: built };
  return built;
}

async function buildGeoContextUncached(input: GeoContextInput): Promise<string> {

  const { bbox, center, zoom, activeLayers } = input;
  const active = new Set(activeLayers.map((l) => l.id));

  const [quakesAll, air, weather, fires, enso, iot, place, cyclonesAll, floods] = await Promise.all([
    withTimeout(fetchEarthquakes("day"), 8000, []),
    active.has("air_quality") ? withTimeout(fetchAirStations(bbox, 60), 8000, []) : Promise.resolve([]),
    withTimeout(fetchWeather(bbox, 16), 9000, []),
    active.has("fires") ? withTimeout(fetchFires(bbox, 1), 9000, []) : Promise.resolve([]),
    active.has("el_nino") ? withTimeout(fetchEnso(), 6000, null) : Promise.resolve(null),
    active.has("iot_sensors") ? withTimeout(fetchReadings(60), 6000, []) : Promise.resolve([]),
    withTimeout(reverseGeocode(center.lat, center.lng), 6000, null),
    withTimeout(fetchCyclones(), 8000, []),
    active.has("flood_risk") ? withTimeout(fetchFloodRisk(bbox, 3), 9000, []) : Promise.resolve([]),
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

  // ---- Local em foco: o que o usuário está efetivamente olhando -------------
  L.push("\n### LOCAL EM FOCO (usar sempre como referência da resposta)");
  if (place) {
    const a = place.address;
    const city = a.city || a.town || a.village || a.suburb || a.neighbourhood;
    L.push(
      `Local no centro da tela: ${place.displayName}` +
        `${city ? ` · município/localidade: ${city}` : ""}` +
        `${a.state ? ` · ${a.state}` : ""}${a.country ? ` · ${a.country}` : ""}`,
    );
  } else {
    L.push(
      `Local no centro da tela: sem correspondência no OpenStreetMap ` +
        `(provavelmente oceano ou área remota) em ${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}.`,
    );
  }

  const nearWeather = nearest(weather, center);
  if (nearWeather) {
    const w = nearWeather.item;
    L.push(
      `Condições agora no ponto mais próximo (${w.city}, a ${fmt(nearWeather.km, 0)} km): ` +
        `${fmt(w.temp)} °C (sensação ${fmt(w.feels)}), umidade ${w.humidity}%, vento ${fmt(w.windSpeed)} km/h ` +
        `(rajada ${fmt(w.gust)}), nuvens ${w.cloud}%, chuva ${fmt(w.precipitation)} mm/h, UV ${fmt(w.uv)}.`,
    );
  }
  const nearAir = nearest(air, center);
  if (nearAir) {
    const a = nearAir.item;
    L.push(
      `Qualidade do ar mais próxima (${a.city}, ${fmt(nearAir.km, 0)} km): PM2.5 ${fmt(a.value)} ${a.unit}` +
        `${a.pm10 != null ? `, PM10 ${fmt(a.pm10)}` : ""}${a.aqi != null ? `, AQI ${a.aqi}` : ""}.`,
    );
  }
  const nearFire = nearest(fires, center);
  if (nearFire) {
    L.push(
      `Foco de queimada mais próximo: ${fmt(nearFire.km, 0)} km do centro · FRP ${fmt(nearFire.item.frp)} MW ` +
        `(${nearFire.item.satellite}).`,
    );
  }
  const nearQuake = nearest(quakesAll, center);
  if (nearQuake && nearQuake.km < 1500) {
    L.push(
      `Sismo mais próximo (24h): M ${fmt(nearQuake.item.mag)} · ${nearQuake.item.place} · ` +
        `${fmt(nearQuake.km, 0)} km do centro.`,
    );
  }
  const nearFlood = [...floods].sort((a, b) => b.risk - a.risk)[0];
  if (nearFlood) {
    L.push(
      `Risco de enchente na área: índice ${fmt(nearFlood.risk, 0)}/100 — ${FLOOD_LEVEL_LABEL[nearFlood.level]} · ` +
        `chuva prevista 24h ${fmt(nearFlood.rain24)} mm / 72h ${fmt(nearFlood.rain72)} mm.`,
    );
  }
  const nearStorm = nearest(cyclonesAll, center);
  if (nearStorm && nearStorm.km < 3000) {
    const s = nearStorm.item;
    L.push(
      `${stormKind(s)} ${s.name} (${cycloneCategory(s.intensityKt).label}) a ${fmt(nearStorm.km, 0)} km do centro, ` +
        `ventos ${s.intensityKt ?? "n/d"} kt.`,
    );
  } else {
    L.push(`Nenhum furacão/ciclone tropical ativo num raio de 3000 km do centro (${cyclonesAll.length} ativos no mundo).`);
  }


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
