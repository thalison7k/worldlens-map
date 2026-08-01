import { useEffect, useState } from "react";
import { Camera, Compass, Copy, Crosshair, Download, LocateFixed, Maximize2, MousePointer2, Ruler, Square } from "lucide-react";
import { bus } from "@/geoos/core/bus";
import { useBus } from "@/geoos/core/useBus";
import { useCollisionFreeSpot, useSafeBottomVar } from "./useCollisionFreeSpot";

/**
 * MapToolbar — barra flutuante de ferramentas SIG que se comunica com o
 * MapKernel via Event Bus. Nenhuma dependência direta com o Leaflet.
 */
export function MapToolbar() {
  const [cursor, setCursor] = useState({ lat: 0, lng: 0 });
  const [zoom, setZoom] = useState(4);
  const [clicked, setClicked] = useState<{ lat: number; lng: number } | null>(null);
  const [measure, setMeasure] = useState<"off" | "distance" | "area">("off");
  const [result, setResult] = useState<string | null>(null);
  useSafeBottomVar();
  const { ref: coordRef, pos } = useCollisionFreeSpot<HTMLDivElement>();



  useBus("map.cursor", (p) => setCursor(p));
  useBus("map.click", (p) => setClicked(p));
  useBus("map.bbox", (b) => {
    setZoom(b.zoom);
    // mobile has no hover cursor: fall back to the viewport center
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
      setCursor({ lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 });
    }
  });
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

  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      bus.emit("notify", { title: "GPS indisponível", message: "Este dispositivo não expõe geolocalização.", level: "warn" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        bus.emit("map.flyTo", { lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 12 });
        bus.emit("notify", {
          title: "Localização encontrada",
          message: `± ${Math.round(pos.coords.accuracy)} m de precisão`,
          level: "success",
        });
      },
      (e) => bus.emit("notify", { title: "Falha no GPS", message: e.message, level: "error" }),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  return (
    <>
      <div className="pointer-events-none fixed left-2 top-1/2 z-20 flex max-h-[75vh] w-auto -translate-y-1/2 flex-col items-start gap-1 duration-500 animate-in fade-in slide-in-from-left-4 sm:left-3">
        <div data-geoos-obstacle className="pointer-events-auto flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-[color:var(--geoos-surface)]/85 px-1 py-1.5 shadow-lg backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:shadow-xl">
          <ToolBtn title="Medir distância" active={measure === "distance"} onClick={() => toggleMeasure("distance")}>
            <Ruler className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn title="Medir área" active={measure === "area"} onClick={() => toggleMeasure("area")}>
            <Square className="h-3.5 w-3.5" />
          </ToolBtn>
          <span className="my-0.5 h-px w-4 bg-white/10" />
          <ToolBtn title="Minha localização (GPS)" onClick={locate}>
            <LocateFixed className="h-3.5 w-3.5" />
          </ToolBtn>
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
          <span className="my-0.5 h-px w-4 bg-white/10" />
          <Compass className="h-3.5 w-3.5 text-white/50 transition-transform duration-500 hover:rotate-180" />
        </div>
      </div>

      {/* Coordenadas — posição calculada por detecção de colisão com os demais painéis */}
      <div
        ref={coordRef}
        style={{ left: pos.left, top: pos.top }}
        className="pointer-events-none fixed z-30 flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-1 transition-[left,top] duration-300 ease-out animate-in fade-in"
      >
        <div className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-[color:var(--geoos-surface)]/85 px-2 py-1 font-mono text-[10px] text-white/70 shadow-lg backdrop-blur-xl transition-all duration-300 hover:border-white/25 hover:bg-white/[0.08]">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <Crosshair className="h-3 w-3 shrink-0 transition-transform duration-300 hover:rotate-90" />
          <span className="tabular-nums transition-colors duration-200">{cursor.lat.toFixed(3)}, {cursor.lng.toFixed(3)}</span>
          <span className="tabular-nums text-white/40">z{zoom}</span>
        </div>
        {clicked && (
          <button
            type="button"
            onClick={() => void copy(`${clicked.lat.toFixed(5)}, ${clicked.lng.toFixed(5)}`)}
            className="pointer-events-auto flex items-center gap-1 whitespace-nowrap rounded-full border border-white/10 bg-[color:var(--geoos-surface)]/85 px-2 py-1 font-mono text-[10px] text-emerald-300 shadow-lg backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-white/[0.08] active:scale-95"
            title="Copiar coordenadas do último clique"
          >
            <MousePointer2 className="h-3 w-3 shrink-0" />
            <span className="tabular-nums">{clicked.lat.toFixed(3)}, {clicked.lng.toFixed(3)}</span>
            <Copy className="h-2.5 w-2.5 shrink-0" />
          </button>
        )}
        {(measure !== "off" || result) && (
          <div className="pointer-events-auto max-w-[60vw] rounded-full border border-white/10 bg-black/70 px-2.5 py-1 text-[10px] leading-snug text-white/80 shadow-lg backdrop-blur duration-300 animate-in fade-in">
            {result ?? (measure === "distance" ? "Clique 2+ pontos no mapa. Duplo clique finaliza." : "Clique 3+ pontos no mapa. Duplo clique finaliza.")}
          </div>
        )}
      </div>
    </>
  );
}


function ToolBtn({ children, active, onClick, title }: { children: React.ReactNode; active?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-md border transition-all duration-200 hover:scale-110 active:scale-90 sm:h-7 sm:w-7 ${
        active
          ? "animate-pulse border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/20 text-white shadow-[0_0_12px_-2px_var(--geoos-accent)]"
          : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
