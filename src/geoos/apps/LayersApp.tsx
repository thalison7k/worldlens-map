import { useState } from "react";
import { LAYER_DEFS, CATEGORY_LABEL } from "@/lib/gis/layer-defs";
import { bus } from "@/geoos/core/bus";
import { Eye, EyeOff } from "lucide-react";

export default function LayersApp() {
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYER_DEFS.map((d) => [d.id, !!d.defaultVisible])),
  );

  const byCat = LAYER_DEFS.reduce<Record<string, typeof LAYER_DEFS>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="text-sm font-semibold">Layers</h3>
        <p className="text-xs text-white/50">17 camadas geoespaciais independentes.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {Object.entries(byCat).map(([cat, defs]) => (
          <div key={cat} className="mb-4">
            <div className="mb-2 px-2 text-[10px] uppercase tracking-wider text-white/40">
              {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? cat}
            </div>
            <div className="space-y-1">
              {defs.map((d) => {
                const on = visible[d.id];
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      const next = !on;
                      setVisible((v) => ({ ...v, [d.id]: next }));
                      bus.emit("map.toggleLayer", { layerId: d.id, visible: next });
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-xs hover:border-white/10 hover:bg-white/5"
                  >
                    <span className="text-white/80">{d.label}</span>
                    {on ? <Eye className="h-3.5 w-3.5 text-[color:var(--geoos-accent)]" /> : <EyeOff className="h-3.5 w-3.5 text-white/30" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
