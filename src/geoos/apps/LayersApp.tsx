import { useEffect, useState } from "react";
import { REAL_LAYER_DEFS } from "@/lib/gis/real-layers";
import { fetchEnso, ensoLabel, ensoColor, type EnsoData } from "@/lib/gis/providers/enso";
import { bus } from "@/geoos/core/bus";
import { Eye, EyeOff, RefreshCw } from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  ambiental: "Ambiental",
  clima: "Clima & Oceano",
};

/**
 * LayersApp — the only functional module. Shows real-data environmental
 * layers backed by public APIs (USGS, OpenAQ, NOAA ENSO). No simulated
 * or random data. Mobile-friendly (fills the window, scrollable).
 */
export default function LayersApp() {
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REAL_LAYER_DEFS.map((d) => [d.id, !!d.defaultVisible])),
  );
  const [enso, setEnso] = useState<EnsoData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadEnso = async () => {
    setRefreshing(true);
    try { setEnso(await fetchEnso()); } catch { /* ignore */ }
    setRefreshing(false);
  };

  useEffect(() => {
    void loadEnso();
    // sync default-visible layers with the map
    REAL_LAYER_DEFS.filter((d) => d.defaultVisible).forEach((d) => {
      bus.emit("map.toggleLayer", { layerId: d.id, visible: true });
    });
  }, []);

  const byCat = REAL_LAYER_DEFS.reduce<Record<string, typeof REAL_LAYER_DEFS>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  const phase = enso?.phase ?? "unknown";
  const anom = enso?.latest?.anom;

  return (
    <div className="flex h-full flex-col text-white">
      <div className="border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Monitoramento Ambiental</h3>
            <p className="text-[11px] text-white/50">
              {REAL_LAYER_DEFS.length} camadas em tempo real · dados públicos
            </p>
          </div>
          <button
            onClick={() => void loadEnso()}
            className="grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10"
            title="Atualizar ENSO"
            aria-label="Atualizar ENSO"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ENSO status card */}
        <div
          className="mt-3 rounded-lg border p-2.5 text-[11px]"
          style={{
            borderColor: `${ensoColor(phase)}55`,
            background: `${ensoColor(phase)}18`,
          }}
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
                      {on ? (
                        <Eye className="h-3.5 w-3.5 text-[color:var(--geoos-accent)]" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-white/30" />
                      )}
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
          Fontes: USGS Earthquake Hazards Program · OpenAQ · NOAA CPC (ONI).
          Todas as camadas são carregadas sob demanda, com cache e revalidação.
        </p>
      </div>
    </div>
  );
}
