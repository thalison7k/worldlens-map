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
  const buildKeysRef = useRef<Map<string, string>>(new Map());
  const buildingRef = useRef<Map<string, string>>(new Map());
  const timeframeRef = useRef<Timeframe>("7d");
  const filtersRef = useRef<OccurrenceFilters>({ ...DEFAULT_FILTERS });
  const refreshTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const refreshMsRef = useRef<number>(300_000); // default 5min: stable for public APIs
  const lastBboxKeyRef = useRef<string>("");
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
      updateWhenIdle: true,
      updateWhenZooming: !isMobile,
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
    let cursorRaf = 0;
    let lastCursorAt = 0;
    let pendingCursor: L.LatLng | null = null;
    if (!isMobile) {
      map.on("mousemove", (e) => {
        const now = performance.now();
        if (now - lastCursorAt < 90) return;
        lastCursorAt = now;
        pendingCursor = e.latlng;
        if (cursorRaf) return;
        cursorRaf = requestAnimationFrame(() => {
          cursorRaf = 0;
          if (!pendingCursor) return;
          const { lat, lng } = pendingCursor;
          setCoords((c) => ({ ...c, lat, lng }));
          bus.emit("map.cursor", { lat, lng });
        });
      });
    }
    map.on("click", (e) => bus.emit("map.click", { lat: e.latlng.lat, lng: e.latlng.lng }));
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

    // Low-frequency tick loop. Real environmental layers are mostly static;
    // running requestAnimationFrame forever was wasting main-thread time.
    let last = performance.now();
    const tickIv = setInterval(() => {
      if (![...builtRef.current.values()].some((b) => b.tick)) return;
      const now = performance.now();
      const dt = now - last;
      last = now;
      builtRef.current.forEach((b) => b.tick?.(dt));
    }, isMobile ? 500 : 250);

    return () => {
      if (cursorRaf) cancelAnimationFrame(cursorRaf);
      clearInterval(tickIv);
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
      updateWhenIdle: true,
      updateWhenZooming: !isMobile,
      subdomains: cfg.subdomains as unknown as string[] | string | undefined,
    }).addTo(map);
    if (overlay) {
      overlayRef.current = L.tileLayer(overlay.url, {
        attribution: overlay.attribution,
        maxZoom: overlay.maxZoom,
        updateWhenIdle: true,
        updateWhenZooming: !isMobile,
        subdomains: overlay.subdomains as unknown as string[] | string | undefined,
        pane: "overlayPane",
      }).addTo(map);
    }
  }, [base]);

  // helpers: build/destroy a layer by id
  const buildLayerKey = (id: string, map: L.Map) => {
    const b = map.getBounds();
    const step = isMobile ? 1 : 0.5;
    const round = (v: number) => Math.round(v / step) * step;
    const zoom = Math.round(map.getZoom() * 2) / 2;
    return [
      id,
      round(b.getWest()), round(b.getSouth()), round(b.getEast()), round(b.getNorth()), zoom,
      timeframeRef.current,
      filtersRef.current.category, filtersRef.current.severity, filtersRef.current.status,
      filtersRef.current.secretaria, filtersRef.current.query,
    ].join(":");
  };

  const buildLayer = (id: string, opts: { force?: boolean } = {}) => {
    const map = mapRef.current;
    const def = ALL_DEFS[id];
    if (!map || !def) return;
    const key = buildLayerKey(id, map);
    if (!opts.force && buildKeysRef.current.get(id) === key) return;
    if (!opts.force && buildingRef.current.has(id)) return;
    const token = `${key}:${performance.now()}`;
    buildingRef.current.set(id, token);
    buildKeysRef.current.set(id, key);
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
    const emit = (count: number) =>
      bus.emit("map.layerBuilt", { layerId: id, count, updatedAt: Date.now() });
    emit(built.meta?.count ?? 0);
    // re-emit once async fetch resolves so the UI shows real counts + timestamp
    if (built.ready) {
      void built.ready.then((r) => {
        if (builtRef.current.get(id) === built) emit(r.count);
      }).finally(() => {
        if (buildingRef.current.get(id) === token) buildingRef.current.delete(id);
      });
    } else {
      buildingRef.current.delete(id);
    }
  };
  const destroyLayer = (id: string) => {
    const map = mapRef.current;
    const b = builtRef.current.get(id);
    if (map && b) { map.removeLayer(b.layer); b.dispose(); }
    builtRef.current.delete(id);
    buildKeysRef.current.delete(id);
    buildingRef.current.delete(id);
    const t = refreshTimersRef.current.get(id);
    if (t) { clearInterval(t); refreshTimersRef.current.delete(id); }
  };

  // reset per-layer auto-refresh timers based on current interval + active layers
  const resetRefreshTimers = () => {
    refreshTimersRef.current.forEach((t) => clearInterval(t));
    refreshTimersRef.current.clear();
    const ms = refreshMsRef.current;
    if (ms <= 0) return;
    builtRef.current.forEach((_b, id) => {
      const iv = setInterval(() => {
        if (document.hidden) return; // avoid background traffic
        if (builtRef.current.has(id)) buildLayer(id, { force: true });
      }, ms);
      refreshTimersRef.current.set(id, iv);
    });
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
      resetRefreshTimers();
    };
    const onOpacity = ({ layerId, opacity }: { layerId: string; opacity: number }) => {
      builtRef.current.get(layerId)?.setOpacity(opacity);
    };
    const onManualRefresh = ({ layerId }: { layerId?: string }) => {
      if (layerId) { if (builtRef.current.has(layerId)) buildLayer(layerId, { force: true }); }
      else builtRef.current.forEach((_b, id) => buildLayer(id, { force: true }));
    };
    const onSetInterval = ({ ms }: { ms: number }) => {
      refreshMsRef.current = ms <= 0 ? 0 : Math.max(120_000, ms | 0);
      resetRefreshTimers();
    };
    const onBbox = (p: { west: number; south: number; east: number; north: number; zoom: number }) => {
      const bboxKey = `${Math.round(p.west)}:${Math.round(p.south)}:${Math.round(p.east)}:${Math.round(p.north)}:${Math.round(p.zoom * 2) / 2}`;
      if (bboxKey === lastBboxKeyRef.current) return;
      lastBboxKeyRef.current = bboxKey;
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

    const onFullscreen = () => {
      const el = mapRef.current?.getContainer();
      if (!el) return;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen?.().catch(() => {});
    };
    const onExport = ({ format }: { format: string }) => {
      const m = mapRef.current;
      if (!m) return;
      if (format === "geojson" || format === "csv") {
        const b = m.getBounds();
        const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        if (format === "geojson") {
          const fc = {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: { name: "Área visível", zoom: m.getZoom(), exportedAt: new Date().toISOString() },
              geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]] },
            }],
          };
          download("bbox.geojson", "application/geo+json", JSON.stringify(fc, null, 2));
        } else {
          const csv = `name,west,south,east,north,zoom,exported_at\nÁrea visível,${bbox.join(",")},${m.getZoom()},${new Date().toISOString()}\n`;
          download("bbox.csv", "text/csv", csv);
        }
        bus.emit("notify", { title: "Export pronto", message: `bbox.${format} baixado`, level: "success" });
      } else if (format === "png") {
        bus.emit("notify", { title: "PNG do mapa", message: "Use ⌘⇧S do navegador ou tela cheia + captura de tela.", level: "info" });
      }
    };

    bus.on("map.flyTo", onFly);
    bus.on("map.setBase", onBase);
    bus.on("map.toggleLayer", onToggle);
    bus.on("map.setOpacity", onOpacity);
    bus.on("map.bbox", onBbox);
    bus.on("timeline.change", onTimeline);
    bus.on("filters.change", onFilters);
    bus.on("map.refreshLayer", onManualRefresh);
    bus.on("layers.setRefreshInterval", onSetInterval);
    bus.on("map.fullscreen", onFullscreen);
    bus.on("map.export", onExport);
    return () => {
      bus.off("map.flyTo", onFly);
      bus.off("map.setBase", onBase);
      bus.off("map.toggleLayer", onToggle);
      bus.off("map.setOpacity", onOpacity);
      bus.off("map.bbox", onBbox);
      bus.off("timeline.change", onTimeline);
      bus.off("filters.change", onFilters);
      bus.off("map.refreshLayer", onManualRefresh);
      bus.off("layers.setRefreshInterval", onSetInterval);
      bus.off("map.fullscreen", onFullscreen);
      bus.off("map.export", onExport);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function download(name: string, type: string, body: string) {
    const blob = new Blob([body], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <div ref={el} className="fixed inset-0 z-0" aria-label="MapKernel" />
      <div className="pointer-events-none fixed bottom-2 right-4 z-10 font-mono text-[10px] text-white/50">
        {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} · z{coords.zoom}
      </div>
    </>
  );
}
