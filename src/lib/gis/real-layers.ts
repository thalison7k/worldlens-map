import L from "leaflet";
import { fetchEarthquakes, magColor } from "./providers/usgs";
import { fetchAirStations, pm25Color } from "./providers/openaq";
import { fetchEnso, ensoColor, ensoLabel } from "./providers/enso";
import { fetchWeather, tempColor } from "./providers/openmeteo";
import { fetchFires, fireColor } from "./providers/firms";
import { fetchReadings } from "@/lib/iot/cloud";
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
          `<div style="min-width:220px">
            <div style="font-weight:700;font-size:13px">${s.city}, ${s.country}</div>
            <div style="font-size:22px;font-weight:700;color:${c};margin-top:6px">${s.value.toFixed(1)} <span style="font-size:11px;color:#94a3b8">${s.unit}</span></div>
            <div style="font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.6">
              <b>Parâmetro:</b> ${s.parameter.toUpperCase()}<br/>
              <b>Coords:</b> ${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}<br/>
              <b>Atualizado:</b> ${new Date(s.updated).toLocaleString("pt-BR")}<br/>
              <b>Fonte:</b> OpenAQ v3
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
    label: "Queimadas (NASA FIRMS)",
    icon: "🔥",
    category: "ambiental",
    order: 88,
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
              <b>Fonte:</b> NASA FIRMS · VIIRS
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
    defaultOpacity: 0.65,
    legend: [
      { color: "#78350f", label: "Solo exposto (< 0.1)" },
      { color: "#eab308", label: "Vegetação baixa" },
      { color: "#22c55e", label: "Vegetação média" },
      { color: "#166534", label: "Vegetação densa (> 0.7)" },
    ],
    build: (ctx) => {
      // GIBS 8-day NDVI (MODIS Terra) — WMTS/EPSG:3857 endpoint.
      // Use a recent Monday to align with 8-day product.
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 10);
      const iso = d.toISOString().slice(0, 10);
      const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/${iso}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
      const tile = L.tileLayer(url, {
        opacity: 0.65,
        maxZoom: 9,
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
    id: "el_nino" as never,
    label: "El Niño / La Niña (NOAA)",
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
      const bounds: L.LatLngBoundsExpression = [[-5, -170], [5, -120]];
      const rect = L.rectangle(bounds, { color, weight: 2, fillColor: color, fillOpacity: 0.35 });
      const anom = data.latest ? data.latest.anom.toFixed(2) : "—";
      const when = data.latest ? `${data.latest.year}-${String(data.latest.month).padStart(2, "0")}` : "sem dados";
      rect.bindPopup(
        `<div style="min-width:220px">
          <div style="font-weight:700;font-size:14px;color:${color}">🌊 ENSO · Niño 3.4</div>
          <div style="font-size:11px;color:#94a3b8;line-height:1.7;margin-top:6px">
            <b>Fase:</b> ${ensoLabel(data.phase)}<br/>
            <b>Anomalia SST:</b> ${anom} °C<br/>
            <b>Referência:</b> ${when}<br/>
            <b>Região:</b> 5°S–5°N · 170°W–120°W<br/>
            <b>Fonte:</b> NOAA CPC (ONI)
          </div>
        </div>`,
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
export const BBOX_DRIVEN_LAYERS = new Set(["air_quality", "weather", "fires"]);

/** Layers that manage their own realtime refresh. */
export const SELF_REFRESHING_LAYERS = new Set<string>();
