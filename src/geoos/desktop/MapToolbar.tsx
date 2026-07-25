import { useEffect, useState } from "react";
import { Camera, Compass, Copy, Crosshair, Download, Maximize2, MousePointer2, Ruler, Square } from "lucide-react";
import { bus } from "@/geoos/core/bus";
import { useBus } from "@/geoos/core/useBus";

/**
 * MapToolbar — barra flutuante de ferramentas SIG que se comunica com o
 * MapKernel via Event Bus. Nenhuma dependência direta com o Leaflet.
 */
export function MapToolbar() {
  const [cursor, setCursor] = useState({ lat: 0, lng: 0 });
  const [clicked, setClicked] = useState<{ lat: number; lng: number } | null>(null);
  const [measure, setMeasure] = useState<"off" | "distance" | "area">("off");
  const [result, setResult] = useState<string | null>(null);

  useBus("map.cursor", (p) => setCursor(p));
  useBus("map.click", (p) => setClicked(p));
  useBus("map.measureResult", (r) => {
    setResult(`${r.mode === "distance" ? "Distância" : "Área"}: ${r.value.toFixed(2)} ${r.unit}`);
  });

  const toggleMeasure = (mode: "distance" | "area") => {
    const next = measure === mode ? "off" : mode;
    setMeasure(next);
    setResult(null);
    bus.emit("map.measure", { mode: next });
  };

  useEffect(() => {
    if (measure === "off") setResult(null);
  }, [measure]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); bus.emit("notify", { title: "Copiado", message: text, level: "success" }); } catch { /* */ }
  };

  return (
    <div className="pointer-events-none fixed left-1/2 top-14 z-20 -translate-x-1/2 sm:left-16 sm:translate-x-0">
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-[color:var(--geoos-surface)]/80 px-1.5 py-1 shadow-lg backdrop-blur-xl">
        <ToolBtn title="Medir distância" active={measure === "distance"} onClick={() => toggleMeasure("distance")}>
          <Ruler className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Medir área" active={measure === "area"} onClick={() => toggleMeasure("area")}>
          <Square className="h-3.5 w-3.5" />
        </ToolBtn>
        <span className="mx-0.5 h-4 w-px bg-white/10" />
        <ToolBtn title="Tela cheia" onClick={() => bus.emit("map.fullscreen", undefined)}>
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Exportar PNG" onClick={() => bus.emit("map.export", { format: "png" })}>
          <Camera className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Exportar GeoJSON" onClick={() => bus.emit("map.export", { format: "geojson" })}>
          <Download className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Exportar CSV" onClick={() => bus.emit("map.export", { format: "csv" })}>
          <Download className="h-3.5 w-3.5 rotate-90" />
        </ToolBtn>
        <span className="mx-0.5 h-4 w-px bg-white/10" />
        <div className="hidden items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-1 font-mono text-[10px] text-white/70 sm:flex">
          <Crosshair className="h-3 w-3" />
          {cursor.lat.toFixed(3)}, {cursor.lng.toFixed(3)}
        </div>
        {clicked && (
          <button
            onClick={() => void copy(`${clicked.lat.toFixed(5)}, ${clicked.lng.toFixed(5)}`)}
            className="hidden items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 font-mono text-[10px] text-emerald-300 hover:bg-white/[0.08] sm:flex"
            title="Copiar coordenadas do último clique"
          >
            <MousePointer2 className="h-3 w-3" />
            {clicked.lat.toFixed(3)}, {clicked.lng.toFixed(3)}
            <Copy className="h-2.5 w-2.5" />
          </button>
        )}
        <Compass className="h-3.5 w-3.5 text-white/50" />
      </div>
      {(measure !== "off" || result) && (
        <div className="pointer-events-auto mt-1 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-center text-[10px] text-white/80 backdrop-blur">
          {result ?? (measure === "distance" ? "Clique 2+ pontos no mapa para medir distância. Duplo clique finaliza." : "Clique 3+ pontos no mapa para medir área. Duplo clique finaliza.")}
        </div>
      )}
    </div>
  );
}

function ToolBtn({ children, active, onClick, title }: { children: React.ReactNode; active?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-7 w-7 place-items-center rounded-md border transition ${
        active
          ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/20 text-white"
          : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
