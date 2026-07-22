import { useEffect, useMemo, useState } from "react";
import { REAL_LAYER_DEFS } from "@/lib/gis/real-layers";
import { fetchEnso, ensoLabel, ensoColor, type EnsoData } from "@/lib/gis/providers/enso";
import { fetchEarthquakes, type Quake } from "@/lib/gis/providers/usgs";
import { bus } from "@/geoos/core/bus";
import { useBus } from "@/geoos/core/useBus";
import { Eye, EyeOff, RefreshCw, Activity } from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  ambiental: "Ambiental",
  clima: "Clima & Oceano",
};

type LiveStats = {
  quakes24h: number;
  maxMag: number;
  quakesM4plus: number;
  lastQuake: Quake | null;
};

/**
 * LayersApp — módulo único do GeoOS. Camadas ambientais em tempo real
 * (USGS · OpenAQ · NOAA ONI) + painel de indicadores ao vivo alimentado
 * pelo Event Bus (`map.layerBuilt`) e por consultas SWR aos providers.
 */
export default function LayersApp() {
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REAL_LAYER_DEFS.map((d) => [d.id, !!d.defaultVisible])),
  );
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [enso, setEnso] = useState<EnsoData | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());

  // live counts per active layer, emitted by the MapKernel
  useBus("map.layerBuilt", ({ layerId, count }) => {
    setCounts((c) => ({ ...c, [layerId]: count }));
    setUpdatedAt(Date.now());
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [e, quakes] = await Promise.all([fetchEnso(), fetchEarthquakes("day")]);
      setEnso(e);
      const sorted = [...quakes].sort((a, b) => b.time - a.time);
      setStats({
        quakes24h: quakes.length,
        maxMag: quakes.reduce((m, q) => Math.max(m, q.mag ?? 0), 0),
        quakesM4plus: quakes.filter((q) => (q.mag ?? 0) >= 4).length,
        lastQuake: sorted[0] ?? null,
      });
      setUpdatedAt(Date.now());
    } catch { /* silent */ }
    setRefreshing(false);
  };

  useEffect(() => {
    void refresh();
    REAL_LAYER_DEFS.filter((d) => d.defaultVisible).forEach((d) => {
      bus.emit("map.toggleLayer", { layerId: d.id, visible: true });
    });
    const iv = setInterval(() => void refresh(), 5 * 60_000);
    return () => clearInterval(iv);
  }, []);

  const byCat = useMemo(
    () =>
      REAL_LAYER_DEFS.reduce<Record<string, typeof REAL_LAYER_DEFS>>((acc, d) => {
        (acc[d.category] ??= []).push(d);
        return acc;
      }, {}),
    [],
  );

  const phase = enso?.phase ?? "unknown";
  const anom = enso?.latest?.anom;
  const activeLayers = Object.values(visible).filter(Boolean).length;
  const totalPoints = Object.entries(counts)
    .filter(([id]) => visible[id])
    .reduce((s, [, n]) => s + (n ?? 0), 0);

  return (
    <div className="flex h-full flex-col text-white">
      <div className="border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Monitoramento Ambiental</h3>
            <p className="text-[11px] text-white/50">
              {REAL_LAYER_DEFS.length} camadas · dados públicos em tempo real
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10"
            title="Atualizar indicadores"
            aria-label="Atualizar indicadores"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Live KPI strip */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px]">
          <Kpi label="Camadas ativas" value={String(activeLayers)} />
          <Kpi label="Pontos no mapa" value={totalPoints.toLocaleString("pt-BR")} />
          <Kpi
            label="Sismo máx. 24h"
            value={stats ? `M ${stats.maxMag.toFixed(1)}` : "—"}
            tone={stats && stats.maxMag >= 5 ? "warn" : "ok"}
          />
        </div>

        {/* ENSO status */}
        <div
          className="mt-2 rounded-lg border p-2.5 text-[11px]"
          style={{ borderColor: `${ensoColor(phase)}55`, background: `${ensoColor(phase)}18` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-white/60">ENSO · Niño 3.4</span>
            <span className="font-semibold" style={{ color: ensoColor(phase) }}>
              {ensoLabel(phase)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-white/50">Anomalia SST</span>
            <span className="font-mono text-white/90">
              {typeof anom === "number" ? `${anom > 0 ? "+" : ""}${anom.toFixed(2)} °C` : "—"}
            </span>
          </div>
          {enso?.latest && (
            <div className="mt-0.5 text-right text-[10px] text-white/40">
              {enso.latest.year}-{String(enso.latest.month).padStart(2, "0")} · NOAA CPC
            </div>
          )}
        </div>

        {stats?.lastQuake && (
          <button
            onClick={() =>
              bus.emit("map.flyTo", {
                lat: stats.lastQuake!.lat,
                lng: stats.lastQuake!.lng,
                zoom: 6,
              })
            }
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-[11px] hover:bg-white/[0.06]"
          >
            <Activity className="h-3.5 w-3.5 text-[color:var(--geoos-accent)]" />
            <span className="flex-1 truncate">
              <span className="font-semibold">M {stats.lastQuake.mag.toFixed(1)}</span>
              <span className="text-white/50"> · {stats.lastQuake.place}</span>
            </span>
            <span className="text-[10px] text-white/40">
              {new Date(stats.lastQuake.time).toLocaleTimeString("pt-BR", {
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {Object.entries(byCat).map(([cat, defs]) => (
          <div key={cat} className="mb-4">
            <div className="mb-2 px-2 text-[10px] uppercase tracking-wider text-white/40">
              {CATEGORY_LABEL[cat] ?? cat}
            </div>
            <div className="space-y-1">
              {defs.map((d) => {
                const on = visible[d.id];
                const n = counts[d.id];
                return (
                  <div
                    key={d.id}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"
                  >
                    <button
                      onClick={() => {
                        const next = !on;
                        setVisible((v) => ({ ...v, [d.id]: next }));
                        bus.emit("map.toggleLayer", { layerId: d.id, visible: next });
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/5"
                    >
                      <span className="flex items-center gap-2 text-white/85">
                        <span>{d.icon}</span>
                        <span>{d.label}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {on && typeof n === "number" && (
                          <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/70">
                            {n.toLocaleString("pt-BR")}
                          </span>
                        )}
                        {on ? (
                          <Eye className="h-3.5 w-3.5 text-[color:var(--geoos-accent)]" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-white/30" />
                        )}
                      </span>
                    </button>
                    {on && (
                      <div className="mt-1.5 flex flex-wrap gap-1 px-2">
                        {d.legend.map((l) => (
                          <span
                            key={l.label}
                            className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] text-white/70"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: l.color }}
                            />
                            {l.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <p className="mt-4 px-2 text-[10px] leading-relaxed text-white/35">
          Fontes: USGS Earthquake Hazards Program · OpenAQ v3 · NOAA CPC (ONI).
          Cache SWR local · atualização automática a cada 5 min ·
          última sincronização {new Date(updatedAt).toLocaleTimeString("pt-BR")}.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      <div
        className={`mt-0.5 font-mono text-[13px] font-semibold ${
          tone === "warn" ? "text-orange-300" : "text-white/90"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
