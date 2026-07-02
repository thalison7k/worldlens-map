import { Map as MapIcon } from "lucide-react";

export default function GeoMapsApp() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <MapIcon className="h-5 w-5 text-[color:var(--geoos-accent)]" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Geo Maps</h3>
          <p className="text-xs text-white/50">O mapa está sempre ativo como núcleo do GeoOS.</p>
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        Esta janela controla o <span className="text-white/90">MapKernel</span> — o mapa que fica
        renderizado no fundo. Feche esta janela para maximizar a área visível do mapa. Use o
        <span className="text-white/90"> Command Palette (⌘K)</span> para voar a qualquer lugar do mundo.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "São Paulo", lat: -23.5505, lng: -46.6333 },
          { label: "Rio de Janeiro", lat: -22.9068, lng: -43.1729 },
          { label: "Manaus", lat: -3.119, lng: -60.0217 },
          { label: "Brasília", lat: -15.7942, lng: -47.8822 },
        ].map((p) => (
          <button
            key={p.label}
            onClick={() =>
              import("@/geoos/core/bus").then(({ bus }) =>
                bus.emit("map.flyTo", { lat: p.lat, lng: p.lng, zoom: 11 }),
              )
            }
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs hover:bg-white/10"
          >
            Ir para <span className="text-white/90">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
