import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cloud,
  CloudRain,
  CloudSun,
  Droplets,
  Eye,
  Flame,
  Gauge,
  Moon,
  RefreshCw,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wifi,
  WifiOff,
  Wind,
  Zap,
} from "lucide-react";
import { useBus } from "@/geoos/core/useBus";
import { bus, type ApiStatus } from "@/geoos/core/bus";
import { fetchEarthquakes } from "@/lib/gis/providers/usgs";
import {
  fetchForecast,
  fetchWeather,
  weatherLabel,
  type ForecastBundle,
} from "@/lib/gis/providers/openmeteo";
import { fetchAirStations } from "@/lib/gis/providers/openaq";
import { fetchFires } from "@/lib/gis/providers/firms";
import { fetchFloodRisk } from "@/lib/gis/providers/floods";

import type { BBox } from "@/lib/gis/simulated";

type Snapshot = {
  quakes: number;
  maxMag: number;
  fires: number;
  frp: number;
  aqi: number;
  pm10: number;
  temp: number;
  feels: number;
  wind: number;
  gust: number;
  humidity: number;
  pressure: number;
  uv: number;
  visibility: number;
  cloud: number;
  precip: number;
  code: number;
  city: string;
  flood: number;
  floodCells: number;

};

const EMPTY: Snapshot = {
  quakes: 0, maxMag: 0, fires: 0, frp: 0, aqi: 0, pm10: 0, temp: 0, feels: 0,
  wind: 0, gust: 0, humidity: 0, pressure: 0, uv: 0, visibility: 0, cloud: 0,
  precip: 0, code: 0, city: "—", flood: 0, floodCells: 0,
};

/**
 * DashboardApp — central meteorológica + ambiental em tempo real, inspirada em
 * painéis profissionais de clima. Todos os números vêm de providers reais
 * (Open-Meteo, USGS, OpenAQ/CAMS, NASA FIRMS) para o bbox atual do MapKernel.
 */
export default function DashboardApp() {
  const [bbox, setBbox] = useState<BBox>([-90, -60, 90, 60]);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [fc, setFc] = useState<ForecastBundle | null>(null);
  const [layers, setLayers] = useState<Record<string, number>>({});
  const [apis, setApis] = useState<Record<string, ApiStatus>>({});
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"clima" | "ambiente">("clima");
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());

  useBus("map.bbox", (b) => setBbox([b.west, b.south, b.east, b.north]));
  useBus("map.layerBuilt", ({ layerId, count }) =>
    setLayers((l) => ({ ...l, [layerId]: count })),
  );
  useBus("api.status", (s) => setApis((m) => ({ ...m, [s.id]: s })));

  const center = useMemo(
    () => ({ lat: (bbox[1] + bbox[3]) / 2, lng: (bbox[0] + bbox[2]) / 2 }),
    [bbox],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const [quakes, weather, air, fires, forecast, floods] = await Promise.all([
        fetchEarthquakes("day"),
        fetchWeather(bbox, 24),
        fetchAirStations(bbox, 100),
        fetchFires(bbox, 1),
        fetchForecast(center.lat, center.lng),
        fetchFloodRisk(bbox, 3).catch(() => []),
      ]);

      const nearest = [...weather].sort(
        (a, b) => dist(a, center) - dist(b, center),
      )[0];
      setSnap({
        quakes: quakes.length,
        maxMag: quakes.reduce((m, q) => Math.max(m, q.mag ?? 0), 0),
        fires: fires.length,
        frp: fires.reduce((s, f) => s + (f.frp || 0), 0),
        aqi: avg(air, (a) => a.value),
        pm10: avg(air, (a) => a.pm10 ?? 0),
        temp: nearest?.temp ?? avg(weather, (w) => w.temp),
        feels: nearest?.feels ?? 0,
        wind: nearest?.windSpeed ?? avg(weather, (w) => w.windSpeed),
        gust: nearest?.gust ?? 0,
        humidity: nearest?.humidity ?? avg(weather, (w) => w.humidity),
        pressure: nearest?.pressure ?? 0,
        uv: nearest?.uv ?? 0,
        visibility: nearest?.visibility ?? 0,
        cloud: nearest?.cloud ?? 0,
        precip: nearest?.precipitation ?? 0,
        code: nearest?.code ?? 0,
        city: nearest?.city ?? "Área visível",
        flood: floods.reduce((m, f) => Math.max(m, f.risk), 0),
        floodCells: floods.filter((f) => f.risk >= 55).length,

      });
      setFc(forecast);
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), 120_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox.join(",")]);

  const activeLayers = Object.values(layers).filter((n) => n > 0).length;
  const totalPts = Object.values(layers).reduce((s, n) => s + n, 0);
  const alerts =
    (snap.maxMag >= 5 ? 1 : 0) + (snap.fires > 20 ? 1 : 0) + (snap.aqi > 55 ? 1 : 0) +
    (snap.flood >= 55 ? 1 : 0);


  const today = fc?.days?.[0];
  const hours = fc?.hours ?? [];
  const tMinH = Math.min(...hours.map((h) => h.temp), 0);
  const tMaxH = Math.max(...hours.map((h) => h.temp), 1);

  const envCards = [
    { label: "Risco de enchente", value: snap.flood ? `${snap.flood}/100` : "—", sub: `${snap.floodCells} área(s) crítica(s) · GloFAS`, icon: CloudRain, tone: snap.flood >= 55 ? "warn" : "ok" },

    { label: "Focos de incêndio", value: snap.fires.toLocaleString("pt-BR"), sub: `FRP ${snap.frp.toFixed(0)} MW · NASA FIRMS`, icon: Flame, tone: snap.fires > 20 ? "warn" : "ok" },
    { label: "Terremotos 24h", value: snap.quakes.toLocaleString("pt-BR"), sub: `Máx M ${snap.maxMag.toFixed(1)} · USGS`, icon: Activity, tone: snap.maxMag >= 5 ? "warn" : "ok" },
    { label: "PM2.5 médio", value: snap.aqi ? snap.aqi.toFixed(1) : "—", sub: `PM10 ${snap.pm10 ? snap.pm10.toFixed(1) : "—"} · CAMS`, icon: Cloud, tone: snap.aqi > 35 ? "warn" : "ok" },
    { label: "Alertas ativos", value: String(alerts), sub: "M≥5 · fogos>20 · PM2.5>55", icon: Zap, tone: alerts > 0 ? "warn" : "ok" },
    { label: "Camadas / pontos", value: `${activeLayers} / ${totalPts.toLocaleString("pt-BR")}`, sub: "carregados no bbox", icon: Activity, tone: "ok" },
    { label: "Chuva agora", value: `${snap.precip.toFixed(1)} mm/h`, sub: `Nuvens ${snap.cloud.toFixed(0)}%`, icon: CloudRain, tone: snap.precip > 5 ? "warn" : "ok" },
  ] as const;

  const gauges = [
    { label: "Umidade", value: `${snap.humidity.toFixed(0)}%`, pct: snap.humidity, icon: Droplets, hint: humidityHint(snap.humidity) },
    { label: "Índice UV", value: snap.uv.toFixed(0), pct: (snap.uv / 11) * 100, icon: Sun, hint: uvHint(snap.uv) },
    { label: "Vento", value: `${snap.wind.toFixed(0)} km/h`, pct: Math.min(100, (snap.wind / 80) * 100), icon: Wind, hint: `Rajadas ${snap.gust.toFixed(0)} km/h` },
    { label: "Pressão", value: `${snap.pressure.toFixed(0)} mb`, pct: Math.min(100, Math.max(0, ((snap.pressure - 960) / 80) * 100)), icon: Gauge, hint: snap.pressure >= 1013 ? "Alta — tempo estável" : "Baixa — instabilidade" },
    { label: "Visibilidade", value: `${snap.visibility.toFixed(0)} km`, pct: Math.min(100, (snap.visibility / 20) * 100), icon: Eye, hint: snap.visibility >= 10 ? "Excelente" : "Reduzida" },
    { label: "Nebulosidade", value: `${snap.cloud.toFixed(0)}%`, pct: snap.cloud, icon: CloudSun, hint: snap.cloud > 70 ? "Encoberto" : snap.cloud > 30 ? "Parcial" : "Limpo" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">Central Ambiental · {snap.city}</h3>
          <p className="truncate text-[11px] text-white/50">
            {center.lat.toFixed(2)}, {center.lng.toFixed(2)} · atualizado{" "}
            {new Date(updatedAt).toLocaleTimeString("pt-BR")}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/10"
          title="Atualizar agora"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 px-3 py-2">
        {(["clima", "ambiente"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors ${
              tab === t
                ? "bg-[color:var(--geoos-accent)]/20 text-[color:var(--geoos-accent)]"
                : "text-white/55 hover:bg-white/[0.06]"
            }`}
          >
            {t === "clima" ? "Clima" : "Ambiente"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "clima" ? (
          <div className="space-y-3 p-3">
            {/* Hero atual */}
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-end gap-2">
                    <span className="font-mono text-4xl font-semibold leading-none">
                      {snap.temp ? `${snap.temp.toFixed(0)}°` : "—"}
                    </span>
                    <span className="pb-1 text-xs text-white/60">
                      sensação {snap.feels ? `${snap.feels.toFixed(0)}°` : "—"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/70">{weatherLabel(snap.code)}</div>
                  {today && (
                    <div className="mt-1 font-mono text-[11px] text-white/50">
                      máx {today.tMax.toFixed(0)}° · mín {today.tMin.toFixed(0)}° · chuva {today.precipProb}%
                    </div>
                  )}
                </div>
                <Thermometer className="h-8 w-8 text-[color:var(--geoos-accent)]/70" />
              </div>
              {today && (
                <div className="mt-3 flex items-center gap-4 border-t border-white/10 pt-2 text-[11px] text-white/60">
                  <span className="flex items-center gap-1">
                    <Sunrise className="h-3.5 w-3.5 text-amber-300" /> {hhmm(today.sunrise)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Sunset className="h-3.5 w-3.5 text-orange-300" /> {hhmm(today.sunset)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Moon className="h-3.5 w-3.5 text-sky-200" /> {dayLength(today.sunrise, today.sunset)}
                  </span>
                </div>
              )}
            </div>

            {/* Próximas horas */}
            {hours.length > 0 && (
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">
                  Próximas 24 horas · Open-Meteo
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {hours.map((h) => {
                    const pct = ((h.temp - tMinH) / Math.max(1, tMaxH - tMinH)) * 100;
                    return (
                      <div key={h.time} className="flex w-12 shrink-0 flex-col items-center gap-1">
                        <span className="font-mono text-[9px] text-white/45">
                          {new Date(h.time).toLocaleTimeString("pt-BR", { hour: "2-digit" })}h
                        </span>
                        <span className="font-mono text-[11px] text-white/90">{h.temp.toFixed(0)}°</span>
                        <div className="h-12 w-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="w-full rounded-full bg-gradient-to-t from-[color:var(--geoos-accent)] to-[color:var(--geoos-accent2)] transition-all"
                            style={{ height: `${Math.max(6, pct)}%`, marginTop: `${100 - Math.max(6, pct)}%` }}
                          />
                        </div>
                        <span className="flex items-center gap-0.5 text-[9px] text-sky-300">
                          <Droplets className="h-2.5 w-2.5" />
                          {h.precipProb}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Medidores */}
            <div className="grid grid-cols-2 gap-2">
              {gauges.map((g) => (
                <div key={g.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                    <g.icon className="h-3 w-3" /> {g.label}
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-white/95">{g.value}</div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[color:var(--geoos-accent)] to-[color:var(--geoos-accent2)] transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(2, g.pct || 0))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[9px] text-white/40">{g.hint}</div>
                </div>
              ))}
            </div>

            {/* 7 dias */}
            {fc?.days?.length ? (
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">Próximos 7 dias</div>
                <div className="space-y-1">
                  {fc.days.map((d) => (
                    <div key={d.date} className="flex items-center gap-2 text-[11px]">
                      <span className="w-10 shrink-0 capitalize text-white/70">
                        {new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" })}
                      </span>
                      <span className="flex w-16 shrink-0 items-center gap-1 text-sky-300">
                        <Droplets className="h-2.5 w-2.5" />
                        {d.precipProb}%
                      </span>
                      <span className="w-8 shrink-0 text-right font-mono text-white/45">
                        {d.tMin.toFixed(0)}°
                      </span>
                      <div className="h-1 flex-1 rounded-full bg-gradient-to-r from-sky-400/60 via-emerald-400/60 to-orange-400/70" />
                      <span className="w-8 shrink-0 font-mono text-white/95">{d.tMax.toFixed(0)}°</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-2">
              {envCards.map((c) => (
                <div
                  key={c.label}
                  className={`rounded-lg border p-2.5 ${
                    c.tone === "warn"
                      ? "border-orange-400/40 bg-orange-500/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                    <c.icon className="h-3 w-3" /> {c.label}
                  </div>
                  <div
                    className={`mt-1 font-mono text-lg font-semibold ${
                      c.tone === "warn" ? "text-orange-300" : "text-white/95"
                    }`}
                  >
                    {c.value}
                  </div>
                  <div className="mt-0.5 text-[9px] text-white/40">{c.sub}</div>
                </div>
              ))}
            </div>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-white/40">Status das APIs</div>
              <div className="space-y-1">
                {["usgs", "openmeteo", "openaq", "firms", "enso"].map((id) => {
                  const s = apis[id];
                  const ok = s?.ok;
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11px]"
                    >
                      <span className="flex items-center gap-1.5 text-white/80">
                        {ok ? (
                          <Wifi className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <WifiOff className="h-3 w-3 text-white/40" />
                        )}
                        {s?.label ?? id.toUpperCase()}
                      </span>
                      <span className="flex items-center gap-2 font-mono text-[10px] text-white/50">
                        {s ? (
                          <>
                            <span>{s.latencyMs}ms</span>
                            {typeof s.count === "number" && <span className="text-white/40">· {s.count}</span>}
                            <span className={ok ? "text-emerald-300" : "text-red-300"}>
                              {ok ? "online" : "offline"}
                            </span>
                          </>
                        ) : (
                          <span className="text-white/30">aguardando…</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => bus.emit("app.open", { appId: "analytics" })}
                className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/80 transition-colors hover:bg-white/10"
              >
                Ver Analytics detalhado →
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function avg<T>(arr: T[], sel: (t: T) => number): number {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + (sel(x) || 0), 0) / arr.length;
}

function dist(p: { lat: number; lng: number }, c: { lat: number; lng: number }) {
  return (p.lat - c.lat) ** 2 + (p.lng - c.lng) ** 2;
}

function hhmm(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dayLength(a: string, b: string) {
  const t = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(t) || t <= 0) return "—";
  const h = Math.floor(t / 3_600_000);
  const m = Math.round((t % 3_600_000) / 60_000);
  return `${h}h ${m}min`;
}

function uvHint(uv: number) {
  if (uv >= 8) return "Muito alto — proteção";
  if (uv >= 6) return "Alto";
  if (uv >= 3) return "Moderado";
  return "Baixo";
}

function humidityHint(h: number) {
  if (h >= 85) return "Muito úmido";
  if (h >= 60) return "Confortável";
  if (h >= 30) return "Normal";
  return "Ar seco";
}
