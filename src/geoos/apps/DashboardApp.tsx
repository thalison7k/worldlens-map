import { useEffect, useMemo, useState } from "react";
import { Activity, Cloud, Flame, Gauge, RefreshCw, Wifi, WifiOff, Wind, Zap } from "lucide-react";
import { useBus } from "@/geoos/core/useBus";
import { bus, type ApiStatus } from "@/geoos/core/bus";
import { fetchEarthquakes } from "@/lib/gis/providers/usgs";
import { fetchWeather, type WeatherPoint } from "@/lib/gis/providers/openmeteo";
import { fetchAirStations, type AirStation } from "@/lib/gis/providers/openaq";
import { fetchFires } from "@/lib/gis/providers/firms";
import type { BBox } from "@/lib/gis/simulated";

type Snapshot = {
  quakes: number;
  maxMag: number;
  fires: number;
  aqi: number;
  temp: number;
  wind: number;
  humidity: number;
};

const EMPTY: Snapshot = { quakes: 0, maxMag: 0, fires: 0, aqi: 0, temp: 0, wind: 0, humidity: 0 };

/**
 * DashboardApp — visão executiva de KPIs ambientais em tempo real. Consome
 * providers reais (USGS, Open-Meteo, OpenAQ, FIRMS) e o `map.bbox` do
 * MapKernel para trocar a área monitorada. Status por API (online/latência)
 * vem do canal `api.status` — nada é fake.
 */
export default function DashboardApp() {
  const [bbox, setBbox] = useState<BBox>([-90, -60, 90, 60]);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [layers, setLayers] = useState<Record<string, number>>({});
  const [apis, setApis] = useState<Record<string, ApiStatus>>({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());

  useBus("map.bbox", (b) => setBbox([b.west, b.south, b.east, b.north]));
  useBus("map.layerBuilt", ({ layerId, count }) =>
    setLayers((l) => ({ ...l, [layerId]: count })),
  );
  useBus("api.status", (s) => setApis((m) => ({ ...m, [s.id]: s })));

  const refresh = async () => {
    setLoading(true);
    try {
      const [quakes, weather, air, fires] = await Promise.all([
        fetchEarthquakes("day"),
        fetchWeather(bbox, 24),
        fetchAirStations(bbox, 100),
        fetchFires(bbox, 1),
      ]);
      setSnap({
        quakes: quakes.length,
        maxMag: quakes.reduce((m, q) => Math.max(m, q.mag ?? 0), 0),
        fires: fires.length,
        aqi: avg(air, (a) => a.value),
        temp: avg(weather, (w) => w.temp),
        wind: avg(weather, (w) => w.windSpeed),
        humidity: avg(weather, (w) => w.humidity),
      });
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
  const alerts = (snap.maxMag >= 5 ? 1 : 0) + (snap.fires > 20 ? 1 : 0) + (snap.aqi > 55 ? 1 : 0);

  const cards = useMemo(
    () => [
      { label: "Focos de incêndio", value: snap.fires.toLocaleString("pt-BR"), sub: "NASA FIRMS · bbox", icon: Flame, tone: snap.fires > 20 ? "warn" : "ok" as const },
      { label: "Terremotos 24h", value: snap.quakes.toLocaleString("pt-BR"), sub: `Máx M ${snap.maxMag.toFixed(1)} · USGS`, icon: Activity, tone: snap.maxMag >= 5 ? "warn" : "ok" as const },
      { label: "AQI médio (PM2.5)", value: snap.aqi ? snap.aqi.toFixed(1) : "—", sub: "OpenAQ v3", icon: Cloud, tone: snap.aqi > 35 ? "warn" : "ok" as const },
      { label: "Temperatura média", value: snap.temp ? `${snap.temp.toFixed(1)}°C` : "—", sub: "Open-Meteo", icon: Gauge },
      { label: "Vento médio", value: snap.wind ? `${snap.wind.toFixed(1)} km/h` : "—", sub: "Open-Meteo", icon: Wind },
      { label: "Umidade média", value: snap.humidity ? `${snap.humidity.toFixed(0)}%` : "—", sub: "Open-Meteo", icon: Cloud },
      { label: "Alertas ativos", value: String(alerts), sub: "Regras: M≥5 · fogos>20 · PM2.5>55", icon: Zap, tone: alerts > 0 ? "warn" : "ok" as const },
      { label: "Camadas / pontos", value: `${activeLayers} / ${totalPts.toLocaleString("pt-BR")}`, sub: "carregados no bbox", icon: Activity },
    ],
    [snap, activeLayers, totalPts, alerts],
  );

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Dashboard Ambiental</h3>
          <p className="text-[11px] text-white/50">
            bbox {bbox.map((v) => v.toFixed(1)).join(", ")} · atualizado {new Date(updatedAt).toLocaleTimeString("pt-BR")}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10"
          title="Atualizar agora"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-lg border p-2.5 ${c.tone === "warn" ? "border-orange-400/40 bg-orange-500/10" : "border-white/10 bg-white/[0.03]"}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
              <c.icon className="h-3 w-3" /> {c.label}
            </div>
            <div className={`mt-1 font-mono text-lg font-semibold ${c.tone === "warn" ? "text-orange-300" : "text-white/95"}`}>
              {c.value}
            </div>
            <div className="mt-0.5 text-[9px] text-white/40">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 px-3 py-2">
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-white/40">Status das APIs</div>
        <div className="space-y-1">
          {["usgs", "openmeteo", "openaq", "firms", "enso"].map((id) => {
            const s = apis[id];
            const ok = s?.ok;
            return (
              <div key={id} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11px]">
                <span className="flex items-center gap-1.5 text-white/80">
                  {ok ? <Wifi className="h-3 w-3 text-emerald-400" /> : <WifiOff className="h-3 w-3 text-white/40" />}
                  {s?.label ?? id.toUpperCase()}
                </span>
                <span className="flex items-center gap-2 font-mono text-[10px] text-white/50">
                  {s ? (
                    <>
                      <span>{s.latencyMs}ms</span>
                      {typeof s.count === "number" && <span className="text-white/40">· {s.count}</span>}
                      <span className={ok ? "text-emerald-300" : "text-red-300"}>{ok ? "online" : "offline"}</span>
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
          className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
        >
          Ver Analytics detalhado →
        </button>
      </div>
    </div>
  );
}

function avg<T>(arr: T[], sel: (t: T) => number): number {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + (sel(x) || 0), 0) / arr.length;
}
