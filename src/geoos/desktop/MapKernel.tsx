import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { bus } from "@/geoos/core/bus";
import { resolveBase, type BaseView } from "@/lib/gis/providers";
import type { BuiltLayer, LayerDef, OccurrenceFilters, Timeframe } from "@/lib/gis/layer-defs";
import { REAL_LAYER_DEFS, BBOX_DRIVEN_LAYERS, SELF_REFRESHING_LAYERS } from "@/lib/gis/real-layers";
import type { BBox } from "@/lib/gis/simulated";

// GeoOS is scoped to environmental monitoring only — the map exposes strictly
// the real-data environmental layers (USGS · OpenAQ · NOAA ONI). Any legacy
// urban / transport / infrastructure layers are intentionally NOT registered.
const ALL_DEFS: Record<string, LayerDef> = Object.fromEntries(
  REAL_LAYER_DEFS.map((d) => [d.id, d]),
);

const DEFAULT_FILTERS: OccurrenceFilters = {
  category: "all",
  severity: "all",
  status: "all",
  secretaria: "all",
  query: "",
};

/**
 * MapKernel — the always-mounted map at the root of the GeoOS desktop.
 * Reacts to Event Bus intents only: flyTo, setBase, toggleLayer, setOpacity.
 * Real-data layers rebuild automatically when the bbox changes.
 */
export function MapKernel({ theme }: { theme: "dark" | "light" }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.TileLayer | null>(null);
  const builtRef = useRef<Map<string, BuiltLayer>>(new Map());
  const timeframeRef = useRef<Timeframe>("7d");
  const filtersRef = useRef<OccurrenceFilters>({ ...DEFAULT_FILTERS });
  const refreshTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const refreshMsRef = useRef<number>(120_000); // default 2min
  const isMobile = typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 768);
  const [base, setBase] = useState<BaseView>(theme === "dark" ? "dark" : "light");
  const [coords, setCoords] = useState({ lat: 0, lng: 0, zoom: 3 });

  // create map once
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = L.map(el.current, {
      center: [-14.235, -51.9253],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
      preferCanvas: true,
      zoomAnimation: !isMobile,
      fadeAnimation: !isMobile,
      markerZoomAnimation: !isMobile,
      wheelDebounceTime: isMobile ? 60 : 40,
      wheelPxPerZoomLevel: isMobile ? 90 : 60,
      zoomSnap: isMobile ? 0.5 : 0.25,
    });
    mapRef.current = map;
    L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);

    const emitBbox = () => {
      const b = map.getBounds();
      bus.emit("map.bbox", {
        west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: map.getZoom(),
      });
    };
    let moveT: ReturnType<typeof setTimeout> | null = null;
    const bboxDebounce = isMobile ? 900 : 400;
    map.on("moveend zoomend", () => {
      setCoords((c) => ({ ...c, zoom: map.getZoom() }));
      if (moveT) clearTimeout(moveT);
      moveT = setTimeout(emitBbox, bboxDebounce);
    });
    if (!isMobile) {
      map.on("mousemove", (e) => setCoords((c) => ({ ...c, lat: e.latlng.lat, lng: e.latlng.lng })));
    }
    emitBbox();

    // Mobile: dim overlay panes during interaction to keep gestures fluid.
    if (isMobile) {
      const container = map.getContainer();
      const setInteracting = (on: boolean) => {
        container.classList.toggle("geoos-interacting", on);
      };
      map.on("movestart zoomstart", () => setInteracting(true));
      map.on("moveend zoomend", () => setInteracting(false));
    }

    // tick loop for animated layers (only when any layer has a tick handler)
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      builtRef.current.forEach((b) => b.tick?.(dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      refreshTimersRef.current.forEach((t) => clearInterval(t));
      refreshTimersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [isMobile]);

  // apply base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { base: cfg, overlay } = resolveBase(base);
    if (baseRef.current) map.removeLayer(baseRef.current);
    if (overlayRef.current) { map.removeLayer(overlayRef.current); overlayRef.current = null; }
    baseRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      subdomains: cfg.subdomains as unknown as string[] | string | undefined,
    }).addTo(map);
    if (overlay) {
      overlayRef.current = L.tileLayer(overlay.url, {
        attribution: overlay.attribution,
        maxZoom: overlay.maxZoom,
        subdomains: overlay.subdomains as unknown as string[] | string | undefined,
        pane: "overlayPane",
      }).addTo(map);
    }
  }, [base]);

  // helpers: build/destroy a layer by id
  const buildLayer = (id: string) => {
    const map = mapRef.current;
    const def = ALL_DEFS[id];
    if (!map || !def) return;
    // dispose previous
    const prev = builtRef.current.get(id);
    if (prev) { map.removeLayer(prev.layer); prev.dispose(); builtRef.current.delete(id); }
    const b = map.getBounds();
    const ctx = {
      map,
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as BBox,
      timeframe: timeframeRef.current,
      filters: filtersRef.current,
    };
    const built = def.build(ctx);
    built.layer.addTo(map);
    if (def.defaultOpacity != null) built.setOpacity(def.defaultOpacity);
    builtRef.current.set(id, built);
    bus.emit("map.layerBuilt", { layerId: id, count: built.meta?.count ?? 0 });
  };
  const destroyLayer = (id: string) => {
    const map = mapRef.current;
    const b = builtRef.current.get(id);
    if (map && b) { map.removeLayer(b.layer); b.dispose(); }
    builtRef.current.delete(id);
  };

  // default visible layers on first mount
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // wait a tick so base layer paints first
    const t = setTimeout(() => {
      REAL_LAYER_DEFS.filter((d) => d.defaultVisible).forEach((d) => buildLayer(d.id));
    }, 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // bus subscriptions
  useEffect(() => {
    const onFly = ({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) =>
      mapRef.current?.flyTo([lat, lng], zoom ?? Math.max(mapRef.current.getZoom(), 10), { duration: 1.4 });
    const onBase = ({ base: b }: { base: string }) => setBase(b as BaseView);
    const onToggle = ({ layerId, visible }: { layerId: string; visible?: boolean }) => {
      const exists = builtRef.current.has(layerId);
      const wantVisible = visible ?? !exists;
      if (wantVisible) buildLayer(layerId);
      else destroyLayer(layerId);
    };
    const onOpacity = ({ layerId, opacity }: { layerId: string; opacity: number }) => {
      builtRef.current.get(layerId)?.setOpacity(opacity);
    };
    const onBbox = () => {
      // rebuild bbox-driven layers when the view changes; skip self-refreshing
      builtRef.current.forEach((_b, id) => {
        if (BBOX_DRIVEN_LAYERS.has(id) && !SELF_REFRESHING_LAYERS.has(id)) buildLayer(id);
      });
    };
    const onTimeline = (p: { range: string; t?: number }) => {
      const prev = timeframeRef.current;
      const nextRange = (p.range as Timeframe) ?? prev;
      // Only rebuild when the range bucket actually changes (avoid rebuilding
      // every 250ms during play). Playback ticks (t) drive opacity/fade only.
      if (nextRange === prev) {
        const t = typeof p.t === "number" ? p.t / 100 : 1;
        builtRef.current.forEach((b) => b.setOpacity(Math.max(0.15, t)));
        return;
      }
      timeframeRef.current = nextRange;
      builtRef.current.forEach((_b, id) => { if (!SELF_REFRESHING_LAYERS.has(id)) buildLayer(id); });
    };
    const onFilters = (p: { key: string; value: unknown }) => {
      const next = { ...filtersRef.current } as unknown as Record<string, unknown>;
      next[p.key] = p.value;
      filtersRef.current = next as unknown as OccurrenceFilters;
      builtRef.current.forEach((_b, id) => { if (!SELF_REFRESHING_LAYERS.has(id)) buildLayer(id); });
    };

    bus.on("map.flyTo", onFly);
    bus.on("map.setBase", onBase);
    bus.on("map.toggleLayer", onToggle);
    bus.on("map.setOpacity", onOpacity);
    bus.on("map.bbox", onBbox);
    bus.on("timeline.change", onTimeline);
    bus.on("filters.change", onFilters);
    return () => {
      bus.off("map.flyTo", onFly);
      bus.off("map.setBase", onBase);
      bus.off("map.toggleLayer", onToggle);
      bus.off("map.setOpacity", onOpacity);
      bus.off("map.bbox", onBbox);
      bus.off("timeline.change", onTimeline);
      bus.off("filters.change", onFilters);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={el} className="fixed inset-0 z-0" aria-label="MapKernel" />
      <div className="pointer-events-none fixed bottom-2 right-4 z-10 font-mono text-[10px] text-white/50">
        {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} · z{coords.zoom}
      </div>
    </>
  );
}
