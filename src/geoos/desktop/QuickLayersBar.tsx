import { useEffect, useState } from "react";
import { bus } from "@/geoos/core/bus";
import { useBus } from "@/geoos/core/useBus";
import { REAL_LAYER_DEFS } from "@/lib/gis/real-layers";

/**
 * QuickLayersBar — barra de toggles de camadas ambientais no topo do mapa
 * (inspirada nas barras de camadas do MSN Clima / Windy). Comunica-se com
 * o MapKernel apenas via `map.toggleLayer`.
 */
export function QuickLayersBar() {
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REAL_LAYER_DEFS.map((d) => [d.id, !!d.defaultVisible])),
  );

  useBus("map.layerBuilt", () => { /* keep chip counts fresh */ });

  useEffect(() => {
    // sync from map (LayersApp is source of truth for defaults)
  }, []);

  const toggle = (id: string) => {
    const next = !visible[id];
    setVisible((v) => ({ ...v, [id]: next }));
    bus.emit("map.toggleLayer", { layerId: id, visible: next });
  };

  return (
    <div className="pointer-events-none fixed left-1/2 top-14 z-10 hidden -translate-x-1/2 duration-500 animate-in fade-in slide-in-from-top-3 md:block">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[color:var(--geoos-surface)]/70 px-2 py-1 shadow backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:shadow-lg">
        {REAL_LAYER_DEFS.map((d) => {
          const on = visible[d.id];
          return (
            <button
              key={d.id}
              onClick={() => toggle(d.id)}
              title={d.label}
              className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] transition-all duration-200 hover:scale-105 active:scale-95 ${
                on
                  ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/15 text-white shadow-[0_0_10px_-3px_var(--geoos-accent)]"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]"
              }`}
            >
              <span className={`text-sm transition-transform duration-300 ${on ? "scale-110" : ""}`}>{d.icon}</span>
              <span className="hidden xl:inline">{d.label.split(" (")[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
