import L from "leaflet";
import { safeTileLayer } from "./tiles";
import { fetchEarthquakes, magColor } from "./providers/usgs";
import { fetchAirStations, pm25Color } from "./providers/openaq";
import { fetchEnso, ensoColor, ensoLabel } from "./providers/enso";
import { fetchWeather, tempColor } from "./providers/openmeteo";
import { fetchFires, fireColor } from "./providers/firms";
import { fetchCyclones, cycloneCategory, bearingLabel } from "./providers/cyclones";
import { fetchReadings } from "@/lib/iot/cloud";
import { fetchFloodRisk, FLOOD_LEVEL_COLOR, FLOOD_LEVEL_LABEL } from "./providers/floods";

import type { LayerDef, BuildCtx, BuiltLayer } from "./layer-defs";

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

/**
 * Gera um contorno orgânico (mancha) em torno de um ponto — usado nas
 * animações 2D de áreas alagadas e das plumas do ENSO. `t` avança a fase
 * para que a borda "respire" como água se espalhando.
 */
function blobRing(
  lat: number,
  lng: number,
  radiusDeg: number,
  seed: number,
  t: number,
  points = 28,
  squash = 1,
): L.LatLngExpression[] {
  const ring: L.LatLngExpression[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const wobble =
      1 +
      0.24 * Math.sin(a * 3 + seed + t * 0.9) +
      0.15 * Math.sin(a * 5 - seed * 1.7 + t * 1.4) +
      0.09 * Math.sin(a * 8 + seed * 0.4 - t * 0.6);
    const r = radiusDeg * wobble;
    ring.push([lat + Math.sin(a) * r * squash, lng + Math.cos(a) * r / Math.max(0.2, Math.cos((lat * Math.PI) / 180))]);
  }
  return ring;
}


const WEATHER_ICON: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "❄️",
  77: "🌨️", 80: "🌦️", 81: "🌧️", 82: "⛈️",
  85: "🌨️", 86: "❄️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

const IOT_COLOR: Record<string, string> = {
  smartphone: "#38bdf8",
  tablet: "#a78bfa",
  desktop: "#34d399",
};

export const REAL_LAYER_DEFS: LayerDef[] = [
  {
    id: "iot_sensors" as never,
    label: "Sensores IoT (nuvem)",
    icon: "📡",
    category: "monitoramento" as never,
    order: 95,
    defaultVisible: false,
    defaultOpacity: 1,
    legend: [
      { color: "#38bdf8", label: "Smartphone" },
      { color: "#a78bfa", label: "Tablet" },
      { color: "#34d399", label: "Desktop" },
    ],
    build: asyncGroup(async (_ctx, group) => {
      const rows = await fetchReadings(300);
      const markers: L.CircleMarker[] = [];
      for (const r of rows) {
        const c = IOT_COLOR[r.device_kind] ?? "#38bdf8";
        const m = L.circleMarker([r.lat, r.lng], {
          radius: 7, color: c, fillColor: c, fillOpacity: 0.55, weight: 2,
        }).bindPopup(
          `<div style="min-width:230px">
            <div style="font-weight:700;font-size:13px;color:${c}">📡 ${r.device_label || "Dispositivo anônimo"}</div>
            <div style="font-size:11px;color:#94a3b8;line-height:1.7;margin-top:6px">
              <b>Tipo:</b> ${r.device_kind} (${r.platform ?? "-"})<br/>
              <b>Rede sem fio:</b> ${r.network_type ?? "n/d"}${r.downlink_mbps != null ? ` · ${r.downlink_mbps} Mbps` : ""}<br/>
              <b>Bateria:</b> ${r.battery_pct != null ? `${r.battery_pct}%` : "n/d"}<br/>
              <b>Temperatura no ponto:</b> ${r.temperature_c != null ? `${r.temperature_c.toFixed(1)} °C` : "n/d"}<br/>
              <b>Precisão GPS:</b> ${r.accuracy_m != null ? `± ${Math.round(r.accuracy_m)} m` : "n/d"}<br/>
              <b>Coords:</b> ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}<br/>
              <b>Enviado:</b> ${new Date(r.created_at).toLocaleString("pt-BR")}<br/>
              ${r.note ? `<b>Nota:</b> ${r.note}<br/>` : ""}
              <b>Fonte:</b> banco de dados na nuvem (GeoOS)
            </div>
          </div>`,
        );
        m.addTo(group);
        markers.push(m);
      }
      return {
        count: markers.length,
        setOpacity: (o) => markers.forEach((m) => m.setStyle({ opacity: o, fillOpacity: 0.55 * o })),
      };
    }),
  },
  {
    id: "earthquakes" as never,
    label: "Terremotos (USGS · 24h)",
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
        const distanceKm = ""; // populated on user click via bus
        const m = L.circleMarker([q.lat, q.lng], {
          radius: Math.max(3, q.mag * 1.6),
          color: c, fillColor: c, fillOpacity: 0.7, weight: 1,
        }).bindPopup(
          `<div style="min-width:220px">
            <div style="font-weight:700;font-size:14px;color:${c}">M ${q.mag.toFixed(1)} · ${q.place}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;line-height:1.6">
              <b>Profundidade:</b> ${q.depthKm.toFixed(1)} km<br/>
              <b>Horário:</b> ${new Date(q.time).toLocaleString("pt-BR")}<br/>
              <b>Coords:</b> ${q.lat.toFixed(3)}, ${q.lng.toFixed(3)}${distanceKm}<br/>
              <b>Tipo:</b> sismo tectônico<br/>
              <b>Fonte:</b> <a href="${q.url}" target="_blank" rel="noreferrer" style="color:#38bdf8">USGS</a>
            </div>
          </div>`,
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
    label: "Qualidade do ar (CAMS · Open-Meteo)",
    icon: "🫁",
    category: "ambiental",
    order: 46,
    defaultVisible: true,
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
          `<div style="min-width:220px">
            <div style="font-weight:700;font-size:13px">${s.city}, ${s.country}</div>
            <div style="font-size:22px;font-weight:700;color:${c};margin-top:6px">${s.value.toFixed(1)} <span style="font-size:11px;color:#94a3b8">${s.unit}</span></div>
            <div style="font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.6">
              <b>Parâmetro:</b> ${s.parameter.toUpperCase()}<br/>
              <b>Coords:</b> ${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}<br/>
              <b>Atualizado:</b> ${new Date(s.updated).toLocaleString("pt-BR")}<br/>
              <b>AQI (US):</b> ${s.aqi ?? "n/d"}<br/>
              <b>PM10:</b> ${s.pm10 != null ? s.pm10.toFixed(1) + " µg/m³" : "n/d"}<br/>
              <b>O₃:</b> ${s.o3 != null ? s.o3.toFixed(1) + " µg/m³" : "n/d"} · <b>NO₂:</b> ${s.no2 != null ? s.no2.toFixed(1) : "n/d"}<br/>
              <b>Fonte:</b> CAMS via Open-Meteo (sem chave)
            </div>
          </div>`,
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
    id: "weather" as never,
    label: "Clima global (Open-Meteo)",
    icon: "🌤️",
    category: "clima",
    order: 60,
    defaultVisible: true,
    defaultOpacity: 1,
    legend: [
      { color: "#818cf8", label: "< 5°C" },
      { color: "#38bdf8", label: "5–15°C" },
      { color: "#22c55e", label: "15–22°C" },
      { color: "#eab308", label: "22–28°C" },
      { color: "#f97316", label: "28–35°C" },
      { color: "#dc2626", label: "≥ 35°C" },
    ],
    build: asyncGroup(async (ctx, group) => {
      const pts = await fetchWeather(ctx.bbox, 18);
      const markers: L.Marker[] = [];
      for (const p of pts) {
        const c = tempColor(p.temp);
        const icon = WEATHER_ICON[p.code] ?? "🌡️";
        const html = `<div style="display:flex;align-items:center;gap:4px;padding:3px 7px;border-radius:999px;background:${c}dd;color:#0b0f1a;font-weight:700;font-size:11px;border:1px solid #ffffff40;box-shadow:0 2px 6px rgba(0,0,0,.35);white-space:nowrap"><span>${icon}</span>${Math.round(p.temp)}°</div>`;
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html, className: "geoos-weather", iconSize: [60, 22], iconAnchor: [30, 11] }),
          keyboard: false,
        }).bindPopup(
          `<div style="min-width:240px">
            <div style="font-weight:700;font-size:14px">${icon} ${p.city}</div>
            <div style="font-size:26px;font-weight:800;color:${c};margin-top:4px">${p.temp.toFixed(1)}°C</div>
            <div style="font-size:11px;color:#94a3b8;line-height:1.7;margin-top:6px">
              <b>Sensação:</b> ${p.feels.toFixed(1)}°C<br/>
              <b>Umidade:</b> ${p.humidity}%<br/>
              <b>Vento:</b> ${p.windSpeed.toFixed(1)} km/h @ ${p.windDir}° (rajadas ${p.gust.toFixed(0)})<br/>
              <b>Chuva agora:</b> ${p.precipitation.toFixed(1)} mm/h${p.rain > 0 ? ` (líquida ${p.rain.toFixed(1)} mm)` : ""}<br/>
              <b>Pressão:</b> ${p.pressure.toFixed(0)} hPa<br/>
              <b>Índice UV:</b> ${p.uv.toFixed(1)}<br/>
              <b>Visibilidade:</b> ${p.visibility.toFixed(1)} km<br/>
              <b>Nebulosidade:</b> ${p.cloud}%<br/>
              <b>Fonte:</b> Open-Meteo
            </div>
          </div>`,
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
  {
    id: "fires" as never,
    label: "Queimadas (INPE / NASA FIRMS)",
    icon: "🔥",
    category: "ambiental",
    order: 88,
    defaultVisible: true,
    defaultOpacity: 0.9,
    legend: [
      { color: "#facc15", label: "< 5 MW" },
      { color: "#eab308", label: "5–20" },
      { color: "#f97316", label: "20–50" },
      { color: "#dc2626", label: "50–100" },
      { color: "#7f1d1d", label: "≥ 100 MW" },
    ],
    build: asyncGroup(async (ctx, group) => {
      const fires = await fetchFires(ctx.bbox, 1);
      const markers: L.CircleMarker[] = [];
      for (const f of fires) {
        const c = fireColor(f.frp);
        const m = L.circleMarker([f.lat, f.lng], {
          radius: Math.max(2.5, Math.min(10, Math.sqrt(f.frp) * 0.9)),
          color: c, fillColor: c, fillOpacity: 0.75, weight: 0,
        }).bindPopup(
          `<div style="min-width:220px">
            <div style="font-weight:700;font-size:14px;color:${c}">🔥 Foco ativo</div>
            <div style="font-size:11px;color:#94a3b8;line-height:1.7;margin-top:6px">
              <b>FRP (potência):</b> ${f.frp.toFixed(1)} MW<br/>
              <b>Brilho:</b> ${f.brightness.toFixed(1)} K<br/>
              <b>Confiança:</b> ${f.confidence}<br/>
              <b>Satélite:</b> ${f.satellite}<br/>
              <b>Data / hora:</b> ${f.date} ${f.time} UTC<br/>
              <b>Coords:</b> ${f.lat.toFixed(3)}, ${f.lng.toFixed(3)}<br/>
              <b>Fonte:</b> INPE Queimadas / NASA FIRMS
            </div>
          </div>`,
        );
        m.addTo(group);
        markers.push(m);
      }
      return {
        count: markers.length,
        setOpacity: (o) => markers.forEach((m) => m.setStyle({ opacity: o, fillOpacity: 0.75 * o })),
      };
    }),
  },
  {
    id: "ndvi" as never,
    label: "Vegetação NDVI (NASA GIBS)",
    icon: "🌿",
    category: "ambiental",
    order: 20,
    defaultVisible: true,
    defaultOpacity: 0.65,
    legend: [
      { color: "#78350f", label: "Solo exposto (< 0.1)" },
      { color: "#eab308", label: "Vegetação baixa" },
      { color: "#22c55e", label: "Vegetação média" },
      { color: "#166534", label: "Vegetação densa (> 0.7)" },
    ],
    build: (ctx) => {
      // GIBS 8-day NDVI (MODIS Terra) — WMTS REST, TileMatrixSet
      // GoogleMapsCompatible_Level9 (EPSG:3857, níveis 0..8).
      // A data precisa cair no início de um período de 8 dias do produto,
      // senão o serviço responde com um tile de erro.
      const now = new Date();
      const year = now.getUTCFullYear();
      const startOfYear = Date.UTC(year, 0, 1);
      const dayOfYear = Math.floor((now.getTime() - startOfYear) / 86_400_000);
      // último período de 8 dias já consolidado (com folga de 1 período)
      const periodStart = Math.max(0, Math.floor(dayOfYear / 8) * 8 - 8);
      const iso = new Date(startOfYear + periodStart * 86_400_000).toISOString().slice(0, 10);
      const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/${iso}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
      const tile = safeTileLayer(url, {
        opacity: 0.65,
        // GIBS só publica NDVI até o nível 8 (Level9 = zooms 0..8).
        // maxNativeZoom faz o Leaflet reamostrar em vez de pedir tiles inválidos.
        maxNativeZoom: 8,
        // upscaling até z12; acima disso o raster vira um borrão inútil e
        // simplesmente deixa de ser desenhado (sem erro nem tile quebrado).
        maxZoom: 12,
        attribution: "NASA GIBS · MODIS Terra NDVI",
      });
      tile.addTo(ctx.map);
      return {
        layer: tile,
        meta: { count: 1 },
        setOpacity: (o) => tile.setOpacity(o),
        dispose: () => { ctx.map.removeLayer(tile); },
      };
    },
  },
  {
    id: "rain_radar" as never,
    label: "Chuva · radar + nuvens e ventos (RainViewer)",
    icon: "🌧️",
    category: "clima",
    order: 40,
    defaultVisible: true,
    defaultOpacity: 0.7,
    legend: [
      { color: "#38bdf8", label: "Chuva fraca" },
      { color: "#22c55e", label: "Moderada" },
      { color: "#eab308", label: "Forte" },
      { color: "#dc2626", label: "Muito forte / tempestade" },
      { color: "#e2e8f0", label: "Nuvens (satélite IR)" },
      { color: "#67e8f9", label: "Setas de vento (km/h)" },
    ],
    build: (ctx) => {
      const group = L.layerGroup().addTo(ctx.map);
      const cloudTiles: L.TileLayer[] = [];
      /** Quadros do radar em ordem cronológica — animação 2D da chuva. */
      const radarFrames: L.TileLayer[] = [];
      const windMarkers: L.Marker[] = [];
      let disposed = false;
      let opacity = 0.7;
      let frameIndex = 0;
      let elapsed = 0;
      const FRAME_MS = 550;

      const showFrame = (i: number) => {
        radarFrames.forEach((t, k) => t.setOpacity(k === i ? opacity : 0));
      };

      const ready = (async () => {
        let count = 0;
        try {
          const r = await fetch("https://api.rainviewer.com/public/weather-maps.json");
          const j = (await r.json()) as {
            host: string;
            radar?: { past?: { path: string }[]; nowcast?: { path: string }[] };
            satellite?: { infrared?: { path: string }[] };
          };
          if (disposed) return { count: 0 };
          // nuvens (satélite infravermelho) por baixo do radar
          const clouds = j.satellite?.infrared ?? [];
          const lastCloud = clouds[clouds.length - 1];
          if (lastCloud) {
            const t = safeTileLayer(`${j.host}${lastCloud.path}/256/{z}/{x}/{y}/0/0_0.png`, {
              opacity: opacity * 0.8,
              // RainViewer publica satélite IR até z10 — acima disso upscaling.
              maxNativeZoom: 10,
              maxZoom: 14,
              attribution: "RainViewer · nuvens (satélite IR)",
            });
            t.addTo(group);
            cloudTiles.push(t);
            count++;
          }
          // Animação: últimos quadros de radar + previsão imediata (nowcast).
          const past = j.radar?.past ?? [];
          const nowcast = j.radar?.nowcast ?? [];
          const seq = [...past.slice(-8), ...nowcast.slice(0, 3)];
          seq.forEach((f) => {
            const t = safeTileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`, {
              opacity: 0,
              // Radar de precipitação é publicado até z12.
              maxNativeZoom: 12,
              maxZoom: 16,
              className: "geoos-rain-frame",
              attribution: "RainViewer · radar de precipitação",
            });
            t.addTo(group);
            radarFrames.push(t);
          });
          if (radarFrames.length) {
            frameIndex = Math.max(0, radarFrames.length - nowcast.slice(0, 3).length - 1);
            showFrame(frameIndex);
            count += radarFrames.length;
          }
        } catch { /* radar/nuvens indisponíveis */ }


        // ventos: setas orientadas pela direção do vento (Open-Meteo)
        try {
          const pts = await fetchWeather(ctx.bbox, 14);
          if (disposed) return { count };
          for (const p of pts) {
            const speed = p.windSpeed;
            const c = speed >= 60 ? "#f87171" : speed >= 30 ? "#fbbf24" : "#67e8f9";
            const html = `<div style="transform:rotate(${p.windDir}deg);font-size:16px;line-height:1;color:${c};text-shadow:0 1px 3px rgba(0,0,0,.6)">↓</div><div style="font-size:9px;font-weight:700;color:${c};text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.8)">${Math.round(speed)}</div>`;
            const m = L.marker([p.lat, p.lng], {
              icon: L.divIcon({ html, className: "geoos-wind", iconSize: [26, 30], iconAnchor: [13, 15] }),
              keyboard: false,
              interactive: true,
            }).bindPopup(
              `<div style="min-width:200px">
                <div style="font-weight:700;font-size:13px;color:${c}">💨 Vento · ${p.city}</div>
                <div style="font-size:11px;color:#94a3b8;line-height:1.7;margin-top:6px">
                  <b>Velocidade:</b> ${p.windSpeed.toFixed(1)} km/h<br/>
                  <b>Rajadas:</b> ${p.gust.toFixed(0)} km/h<br/>
                  <b>Direção:</b> ${p.windDir}° (de onde sopra)<br/>
                  <b>Nebulosidade:</b> ${p.cloud}%<br/>
                  <b>Chuva agora:</b> ${p.precipitation.toFixed(1)} mm/h<br/>
                  <b>Fonte:</b> Open-Meteo + RainViewer
                </div>
              </div>`,
            );
            m.addTo(group);
            windMarkers.push(m);
            count++;
          }
        } catch { /* ventos indisponíveis */ }
        return { count };
      })();
      return {
        layer: group,
        meta: { count: 1 },
        ready,
        // Animação 2D: avança os quadros do radar em loop suave.
        tick: (dt: number) => {
          if (radarFrames.length < 2) return;
          elapsed += dt;
          if (elapsed < FRAME_MS) return;
          elapsed = 0;
          frameIndex = (frameIndex + 1) % radarFrames.length;
          showFrame(frameIndex);
        },
        setOpacity: (o) => {
          opacity = o;
          cloudTiles.forEach((t) => t.setOpacity(o * 0.8));
          showFrame(frameIndex);
          windMarkers.forEach((m) => m.setOpacity(o));
        },
        dispose: () => { disposed = true; group.clearLayers(); ctx.map.removeLayer(group); },
      };
    },
  },
  {
    id: "el_nino" as never,
    label: "El Niño / La Niña (NOAA)",
    icon: "🌊",
    category: "clima",
    order: 30,
    defaultVisible: true,
    defaultOpacity: 0.55,
    legend: [
      { color: "#b91c1c", label: "El Niño forte (≥ 1.5)" },
      { color: "#ea580c", label: "El Niño (≥ 0.5)" },
      { color: "#64748b", label: "Neutro" },
      { color: "#0284c7", label: "La Niña (≤ -0.5)" },
      { color: "#1e40af", label: "La Niña forte (≤ -1.5)" },
    ],
    build: (ctx) => {
      const group = L.layerGroup();
      let disposed = false;
      let opacity = 0.55;
      let phase = 0;
      const meta = { count: 0 };
      type Plume = { poly: L.Polygon; lat: number; lng: number; r: number; seed: number; drift: number; alpha: number };
      const plumes: Plume[] = [];

      const ready = (async () => {
        const data = await fetchEnso();
        if (disposed) return { count: 0 };
        const anomVal = data.latest?.anom ?? 0;
        const warm = anomVal >= 0;
        const strength = Math.min(1, Math.abs(anomVal) / 2);
        const color = ensoColor(data.phase);
        const anom = data.latest ? data.latest.anom.toFixed(2) : "—";
        const when = data.latest ? `${data.latest.year}-${String(data.latest.month).padStart(2, "0")}` : "sem dados";
        const popup = `<div style="min-width:230px">
            <div style="font-weight:700;font-size:14px;color:${color}">🌊 ENSO · Niño 3.4</div>
            <div style="font-size:11px;color:#94a3b8;line-height:1.7;margin-top:6px">
              <b>Fase:</b> ${ensoLabel(data.phase)}<br/>
              <b>Anomalia SST:</b> ${anom} °C<br/>
              <b>Referência:</b> ${when}<br/>
              <b>Região:</b> 5°S–5°N · 170°W–120°W<br/>
              <b>Fonte:</b> NOAA CPC (ONI)
            </div>
          </div>`;

        // Plumas ao longo do Pacífico equatorial: núcleo quente (El Niño) ou
        // frio (La Niña) que "escoa" para leste, como na visualização de TSM.
        const cores = warm
          ? ["#fde047", "#fb923c", "#ef4444", "#b91c1c"]
          : ["#bae6fd", "#38bdf8", "#2563eb", "#1e3a8a"];
        for (let i = 0; i < 9; i++) {
          const p = i / 8;
          const lng = -170 + p * 70; // 170°W → 100°W
          const lat = Math.sin(p * Math.PI) * 1.6 * (warm ? 1 : -1);
          const r = (2.6 + Math.sin(p * Math.PI) * 4.2) * (0.6 + strength * 0.8);
          const ci = Math.min(cores.length - 1, Math.round(Math.sin(p * Math.PI) * (cores.length - 1)));
          const c = cores[ci]!;
          const poly = L.polygon(blobRing(lat, lng, r, i * 1.9, 0, 30, 0.55), {
            color: c,
            weight: 1,
            fillColor: c,
            fillOpacity: 0.3 * opacity,
            opacity: 0.5 * opacity,
            className: "geoos-enso-plume",
            interactive: i === 4,
          });
          if (i === 4) poly.bindPopup(popup);
          poly.addTo(group);
          plumes.push({ poly, lat, lng, r, seed: i * 1.9, drift: 0.5 + i * 0.08, alpha: 0.18 + Math.sin(p * Math.PI) * 0.24 });
        }
        meta.count = plumes.length;
        return { count: plumes.length };
      })().catch(() => ({ count: 0 }));

      return {
        layer: group,
        meta,
        ready,
        /** Animação 2D: plumas de anomalia térmica pulsando e escoando. */
        tick: (dt: number) => {
          if (!plumes.length) return;
          phase += dt / 1000;
          for (const p of plumes) {
            const breathe = 1 + 0.12 * Math.sin(phase * p.drift + p.seed);
            const lng = p.lng + Math.sin(phase * 0.25 + p.seed) * 1.8;
            p.poly.setLatLngs(blobRing(p.lat, lng, p.r * breathe, p.seed, phase * 0.8, 30, 0.55));
            p.poly.setStyle({ fillOpacity: (p.alpha + 0.06 * Math.sin(phase * 1.3 + p.seed)) * opacity });
          }
        },
        setOpacity: (o) => {
          opacity = o;
          plumes.forEach((p) => p.poly.setStyle({ opacity: 0.5 * o, fillOpacity: p.alpha * o }));
        },
        dispose: () => { disposed = true; group.clearLayers(); },
      };
    },

  },
  {
    id: "cyclones" as never,
    label: "Ciclones tropicais (NOAA NHC + GDACS)",
    icon: "🌀",
    category: "clima",
    order: 97,
    defaultVisible: true,
    defaultOpacity: 1,
    legend: [
      { color: "#94a3b8", label: "Depressão tropical" },
      { color: "#38bdf8", label: "Tempestade tropical" },
      { color: "#f59e0b", label: "Categoria 1" },
      { color: "#ea580c", label: "Categoria 2" },
      { color: "#dc2626", label: "Categoria 3" },
      { color: "#b91c1c", label: "Categoria 4" },
      { color: "#7f1d1d", label: "Categoria 5" },
    ],
    build: asyncGroup(async (_ctx, group) => {
      const storms = await fetchCyclones();
      const shapes: Array<L.Circle | L.Marker> = [];
      for (const s of storms) {
        const { label, color } = cycloneCategory(s.intensityKt);
        const radiusM = Math.max(80_000, (s.intensityKt ?? 30) * 3_000);
        const eye = L.circle([s.lat, s.lng], {
          radius: radiusM, color, fillColor: color, fillOpacity: 0.18, weight: 2,
        });
        const icon = L.divIcon({
          className: "geoos-cyclone",
          html: `<div class="geoos-cyclone-spin" style="color:${color}">🌀</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const marker = L.marker([s.lat, s.lng], { icon });
        const popup =
          `<div style="min-width:240px">
            <div style="font-weight:700;font-size:14px;color:${color}">🌀 ${s.name} · ${label}</div>
            <div style="font-size:11px;color:#94a3b8;line-height:1.7;margin-top:6px">
              <b>Classificação:</b> ${s.classification}<br/>
              <b>Ventos máximos:</b> ${s.intensityKt != null ? `${s.intensityKt} kt (${Math.round(s.intensityKt * 1.852)} km/h)` : "n/d"}<br/>
              <b>Pressão central:</b> ${s.pressureMb != null ? `${s.pressureMb} hPa` : "n/d"}<br/>
              <b>Deslocamento:</b> ${bearingLabel(s.movementDir)}${s.movementSpeedKt != null ? ` a ${s.movementSpeedKt} kt` : ""}<br/>
              <b>Coords:</b> ${s.lat.toFixed(2)}, ${s.lng.toFixed(2)}<br/>
              <b>Atualizado:</b> ${s.lastUpdate ? new Date(s.lastUpdate).toLocaleString("pt-BR") : "n/d"}<br/>
              <b>Fonte:</b> ${s.source ?? "NOAA National Hurricane Center"}
            </div>
          </div>`;
        eye.bindPopup(popup);
        marker.bindPopup(popup);
        eye.addTo(group);
        marker.addTo(group);
        shapes.push(eye, marker);
      }
      return {
        count: storms.length,
        setOpacity: (o) => shapes.forEach((s) => {
          if ("setStyle" in s) (s as L.Circle).setStyle({ opacity: o, fillOpacity: 0.18 * o });
          else (s as L.Marker).setOpacity(o);
        }),
      };
    }),
  },
  {

    id: "flood_risk" as never,
    label: "Áreas alagáveis / enchentes (GloFAS + chuva)",
    icon: "🌊",
    category: "clima",
    order: 41,
    defaultVisible: true,
    defaultOpacity: 0.75,
    legend: [
      { color: FLOOD_LEVEL_COLOR.extremo, label: "Extremo (≥ 75)" },
      { color: FLOOD_LEVEL_COLOR.alto, label: "Alto (55–74)" },
      { color: FLOOD_LEVEL_COLOR.moderado, label: "Moderado (32–54)" },
      { color: FLOOD_LEVEL_COLOR.baixo, label: "Baixo (< 32)" },
    ],
    build: (ctx) => {
      const group = L.layerGroup().addTo(ctx.map);
      type Zone = {
        halo: L.Polygon;
        core: L.Polygon;
        lat: number;
        lng: number;
        rDeg: number;
        risk: number;
        seed: number;
      };
      const zones: Zone[] = [];
      let disposed = false;
      let opacity = 0.75;
      let phase = 0;

      const ready = (async () => {
        const cells = await fetchFloodRisk(ctx.bbox, 4);
        if (disposed) return { count: 0 };
        const risky = cells.filter((c) => c.risk >= 25);
        const [w, s, e, n] = ctx.bbox;
        const span = Math.max(Math.abs(e - w), Math.abs(n - s));
        for (let i = 0; i < risky.length; i++) {
          const f = risky[i]!;
          const color = FLOOD_LEVEL_COLOR[f.level];
          // raio em graus proporcional à célula da grade e ao risco
          const rDeg = Math.max(0.05, Math.min(3.2, (span / 6) * (0.45 + (f.risk / 100) * 0.45)));
          const seed = i * 1.37 + f.lat * 0.3;
          const popup = `<div style="min-width:250px">
              <div style="font-weight:700;font-size:14px;color:${color}">🌊 Risco de alagamento · ${f.risk}/100</div>
              <div style="font-size:11px;color:#94a3b8;line-height:1.7;margin-top:6px">
                <b>Classificação:</b> ${FLOOD_LEVEL_LABEL[f.level]}<br/>
                <b>Chuva prevista 24 h:</b> ${f.rain24.toFixed(1)} mm<br/>
                <b>Chuva prevista 72 h:</b> ${f.rain72.toFixed(1)} mm<br/>
                <b>Pico horário:</b> ${f.rainPeak.toFixed(1)} mm/h<br/>
                <b>Vazão do rio:</b> ${f.discharge != null ? `${f.discharge.toFixed(1)} m³/s` : "n/d"}${
                  f.dischargeRatio != null ? ` (${(f.dischargeRatio * 100).toFixed(0)}% da média)` : ""
                }<br/>
                <b>Altitude do terreno:</b> ${f.elevation != null ? `${f.elevation.toFixed(0)} m` : "n/d"}<br/>
                <b>Coords:</b> ${f.lat.toFixed(3)}, ${f.lng.toFixed(3)}<br/>
                <b>Fonte:</b> Open-Meteo Flood (GloFAS v4) + previsão de chuva + Copernicus DEM
              </div>
            </div>`;

          // Mancha externa (lâmina d'água rasa) + núcleo (alagamento severo)
          const halo = L.polygon(blobRing(f.lat, f.lng, rDeg, seed, 0), {
            color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.16 * opacity,
            opacity: 0.35 * opacity,
            className: "geoos-flood-zone",
            interactive: false,
          });
          const core = L.polygon(blobRing(f.lat, f.lng, rDeg * 0.55, seed + 3.1, 0), {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.34 * opacity,
            opacity: 0.8 * opacity,
            className: "geoos-flood-zone",
          }).bindPopup(popup);
          halo.addTo(group);
          core.addTo(group);
          zones.push({ halo, core, lat: f.lat, lng: f.lng, rDeg, risk: f.risk, seed });
        }
        return { count: zones.length };
      })().catch(() => ({ count: 0 }));

      return {
        layer: group,
        meta: { count: 0 },
        ready,
        /**
         * Animação 2D: ciclo de cheia — a mancha nasce pequena, se expande até
         * o pico (proporcional ao risco) e recua, com a borda ondulando como
         * lâmina d'água em movimento.
         */
        tick: (dt: number) => {
          if (!zones.length) return;
          phase += dt / 1000;
          for (const z of zones) {
            const speed = 0.28 + (z.risk / 100) * 0.35;
            // ciclo 0→1→0 (enchente/vazante)
            const cycle = (Math.sin(phase * speed + z.seed) + 1) / 2;
            const grow = 0.45 + cycle * 0.75;
            z.halo.setLatLngs(blobRing(z.lat, z.lng, z.rDeg * grow, z.seed, phase * 1.1));
            z.core.setLatLngs(blobRing(z.lat, z.lng, z.rDeg * 0.55 * grow, z.seed + 3.1, phase * 1.6));
            z.halo.setStyle({ fillOpacity: (0.10 + cycle * 0.14) * opacity });
            z.core.setStyle({ fillOpacity: (0.24 + cycle * 0.22) * opacity });
          }
        },
        setOpacity: (o) => {
          opacity = o;
          zones.forEach((z) => {
            z.halo.setStyle({ opacity: 0.35 * o, fillOpacity: 0.16 * o });
            z.core.setStyle({ opacity: 0.8 * o, fillOpacity: 0.34 * o });
          });
        },
        dispose: () => { disposed = true; group.clearLayers(); ctx.map.removeLayer(group); },
      };
    },

  },
];

/** Layer ids that need to rebuild whenever the map bbox changes. */
export const BBOX_DRIVEN_LAYERS = new Set(["air_quality", "weather", "fires", "rain_radar", "flood_risk"]);


/** Layers that manage their own realtime refresh. */
export const SELF_REFRESHING_LAYERS = new Set<string>();
