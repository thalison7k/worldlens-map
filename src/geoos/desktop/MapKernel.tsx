import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { bus } from "@/geoos/core/bus";
import { resolveBase, type BaseView } from "@/lib/gis/providers";
import { generateOccurrences } from "@/lib/gis/simulated";
import { SEV_COLOR } from "@/lib/gis/layer-defs";

/**
 * MapKernel — the always-mounted map at the root of the GeoOS desktop.
 * It listens to the Event Bus for intents (flyTo, setBase, toggleLayer)
 * and never unmounts, so apps can freely open/close without breaking Leaflet.
 */
export function MapKernel({ theme }: { theme: "dark" | "light" }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const layersRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const [base, setBase] = useState<BaseView>(theme === "dark" ? "dark" : "light");
  const [coords, setCoords] = useState({ lat: 0, lng: 0, zoom: 3 });

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = L.map(el.current, {
      center: [-14.235, -51.9253],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
      preferCanvas: true,
    });
    mapRef.current = map;
    L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);

    map.on("mousemove", (e) => setCoords((c) => ({ ...c, lat: e.latlng.lat, lng: e.latlng.lng })));
    map.on("zoomend moveend", () => setCoords((c) => ({ ...c, zoom: map.getZoom() })));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // apply base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { base: cfg, overlay } = resolveBase(base);
    if (baseRef.current) map.removeLayer(baseRef.current);
    baseRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom, subdomains: cfg.subdomains as any }).addTo(map);
    if (overlay) L.tileLayer(overlay.url, { attribution: overlay.attribution, maxZoom: overlay.maxZoom, subdomains: overlay.subdomains as any, pane: "overlayPane" }).addTo(map);
  }, [base]);

  // bus subscriptions
  useEffect(() => {
    const onFly = ({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) =>
      mapRef.current?.flyTo([lat, lng], zoom ?? Math.max(mapRef.current.getZoom(), 10), { duration: 1.4 });
    const onBase = ({ base: b }: { base: string }) => setBase(b as BaseView);
    const onToggle = ({ layerId, visible }: { layerId: string; visible?: boolean }) => {
      const map = mapRef.current;
      if (!map) return;
      const existing = layersRef.current.get(layerId);
      if (existing) {
        map.removeLayer(existing);
        layersRef.current.delete(layerId);
        if (visible === false) return;
      }
      if (visible === false) return;
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      const pts = generateOccurrences(bbox, 7 * 24 * 3600_000);
      const group = L.layerGroup();
      pts.forEach((o) => {
        L.circleMarker([o.lat, o.lng], {
          radius: 5,
          color: SEV_COLOR[o.severity],
          weight: 1,
          fillOpacity: 0.55,
        })
          .bindPopup(`<b>${o.title}</b><br/>${o.neighborhood} · ${o.severity}`)
          .addTo(group);
      });
      group.addTo(map);
      layersRef.current.set(layerId, group);
    };

    bus.on("map.flyTo", onFly);
    bus.on("map.setBase", onBase);
    bus.on("map.toggleLayer", onToggle);
    return () => {
      bus.off("map.flyTo", onFly);
      bus.off("map.setBase", onBase);
      bus.off("map.toggleLayer", onToggle);
    };
  }, []);

  // Theme Engine owns base selection via `map.setBase`; no direct theme coupling here.

  return (
    <>
      <div ref={el} className="fixed inset-0 z-0" aria-label="MapKernel" />
      <div className="pointer-events-none fixed bottom-2 right-4 z-10 font-mono text-[10px] text-white/50">
        {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} · z{coords.zoom}
      </div>
    </>
  );
}
