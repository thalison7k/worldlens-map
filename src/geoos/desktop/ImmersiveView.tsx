import { useEffect, useRef, useState } from "react";
import { Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shouldExitImmersive } from "@/geoos/core/immersive";
import "maplibre-gl/dist/maplibre-gl.css";

export type ImmersiveCamera = { lat: number; lng: number; zoom: number };

export function ImmersiveView({ initial, onClose }: {
  initial: ImmersiveCamera;
  onClose: (camera: ImmersiveCamera) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const camera = useRef(initial);
  const close = useRef(onClose);
  close.current = onClose;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => { if (alive) setStatus("error"); }, 20_000);
    const finish = () => close.current(camera.current);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", key);
    void (async () => {
      try {
        const [gl, response] = await Promise.all([
          import("maplibre-gl"),
          fetch("https://tiles.openfreemap.org/styles/liberty", { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error("Cartografia indisponível");
        const style = await response.json();
        // Remove inferred heights: extrude only footprints with a source height.
        const buildings = style.layers.find((layer: { id: string }) => layer.id === "building-3d");
        if (buildings) {
          buildings.filter = ["all", ["!", ["has", "hide_3d"]], ["has", "height"]];
          buildings.paint["fill-extrusion-height"] = ["to-number", ["get", "height"], 0];
          buildings.paint["fill-extrusion-base"] = ["to-number", ["get", "min_height"], 0];
        }
        if (!alive || !host.current) return;
        const map = new gl.Map({
          container: host.current, style, center: [initial.lng, initial.lat],
          zoom: initial.zoom, pitch: 60, bearing: -20, maxZoom: 19,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new gl.NavigationControl({ visualizePitch: true }), "bottom-right");
        map.on("load", () => { clearTimeout(timer); if (alive) setStatus("ready"); });
        map.on("moveend", () => {
          const c = map.getCenter();
          camera.current = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
          if (shouldExitImmersive(map.getZoom())) finish();
        });
      } catch {
        clearTimeout(timer);
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("keydown", key);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initial]);

  return (
    <section className="immersive-view fixed inset-0 z-50 bg-background text-foreground" aria-label="Visão imersiva da localidade">
      <div className="absolute inset-0"><div ref={host} className="h-full w-full" /></div>
      <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
        <div className="rounded-md border border-border bg-background/95 px-3 py-2">
          <h2 className="text-sm font-semibold">Immersive View · Cartografia 3D</h2>
          <p className="text-xs text-muted-foreground">OpenStreetMap · {initial.lat.toFixed(4)}, {initial.lng.toFixed(4)}</p>
        </div>
        <Button variant="secondary" size="icon" className="size-11 shrink-0" title="Voltar ao mapa ambiental" aria-label="Voltar ao mapa ambiental" onClick={() => onClose(camera.current)}><X /></Button>
      </div>
      {status === "loading" && <div role="status" className="absolute bottom-24 left-3 rounded-md bg-background/95 p-3 text-sm">Carregando cartografia real…</div>}
      {status === "error" && <div role="alert" className="absolute bottom-24 left-3 right-3 mx-auto max-w-sm rounded-md border border-border bg-background p-4 text-sm">A visão 3D não está disponível neste navegador ou conexão.<Button variant="outline" className="mt-3 w-full" onClick={() => onClose(camera.current)}>Voltar ao mapa ambiental</Button></div>}
      {status === "ready" && <Button variant="secondary" size="icon" className="absolute bottom-6 left-3 size-11" title="Orientar para o norte" aria-label="Orientar para o norte" onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 60, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 })}><Compass /></Button>}
    </section>
  );
}