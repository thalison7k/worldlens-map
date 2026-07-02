import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.heat";

import { BASE_PROVIDERS, resolveBase, type BaseView } from "@/lib/gis/providers";
import { parseCoordinates, reverseGeocode, searchAddress, type GeocodeResult } from "@/lib/gis/geocoding";
import { computeIsa, type IsaResult } from "@/lib/gis/isa";
import {
  LAYER_DEFS, LAYERS_BY_ID, CATEGORY_LABEL, SEV_COLOR,
  type LayerId, type Timeframe, type BuiltLayer, type OccurrenceFilters,
} from "@/lib/gis/layer-defs";
import { generateOccurrences } from "@/lib/gis/simulated";
import type { OccurrenceKind } from "@/lib/gis/types";

const BASE_VIEWS: { id: BaseView; label: string }[] = [
  { id: "street", label: "OSM" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "satellite", label: "Satélite" },
  { id: "terrain", label: "OpenTopo" },
  { id: "hybrid", label: "Híbrida" },
];

const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "12m", label: "12 meses" },
];

type LayerState = {
  visible: boolean;
  opacity: number;
};

type LiveLocation = { lat: number; lng: number; altitude: number | null; accuracy: number };

function timeframeMs(tf: Timeframe): number {
  switch (tf) {
    case "today":
    case "24h": return 24 * 3600_000;
    case "7d": return 7 * 24 * 3600_000;
    case "30d": return 30 * 24 * 3600_000;
    case "12m": return 365 * 24 * 3600_000;
  }
}

export default function WorldMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLayerRef = useRef<L.TileLayer | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const minimapRef = useRef<L.Map | null>(null);
  const minimapContainerRef = useRef<HTMLDivElement>(null);
  const builtRef = useRef<Map<LayerId, BuiltLayer>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(performance.now());

  const [baseView, setBaseView] = useState<BaseView>("dark");
  const [layerState, setLayerState] = useState<Record<LayerId, LayerState>>(() => {
    const initial = {} as Record<LayerId, LayerState>;
    for (const d of LAYER_DEFS) initial[d.id] = { visible: !!d.defaultVisible, opacity: d.defaultOpacity ?? 1 };
    return initial;
  });
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showClusters, setShowClusters] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>("7d");
  const [filters, setFilters] = useState<OccurrenceFilters>({
    category: "all", severity: "all", status: "all", secretaria: "all", query: "",
  });
  const [bboxKey, setBboxKey] = useState(0); // increments on moveend to trigger rebuild
  const [cursor, setCursor] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const [zoom, setZoom] = useState(2);
  const [bearing, setBearing] = useState(0);
  const [liveLoc, setLiveLoc] = useState<LiveLocation | null>(null);
  const [addr, setAddr] = useState<GeocodeResult | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [isa, setIsa] = useState<IsaResult | null>(null);
  const [layerCounts, setLayerCounts] = useState<Record<string, number>>({});
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [-14.235, -51.9253], zoom: 4, minZoom: 2, maxZoom: 20,
      worldCopyJump: true, zoomControl: true, preferCanvas: true,
    });
    mapRef.current = map;
    L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
    map.on("mousemove", (e) => setCursor({ lat: e.latlng.lat, lng: e.latlng.lng }));
    const onMoveEnd = () => { setZoom(map.getZoom()); setBboxKey((k) => k + 1); };
    map.on("moveend zoomend", onMoveEnd);
    setBboxKey(1);

    if (minimapContainerRef.current) {
      const mm = L.map(minimapContainerRef.current, {
        attributionControl: false, zoomControl: false, dragging: false,
        scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false,
      }).setView([0, 0], 0);
      minimapRef.current = mm;
      L.tileLayer(BASE_PROVIDERS.dark.url, { subdomains: BASE_PROVIDERS.dark.subdomains, attribution: "" }).addTo(mm);
      map.on("moveend zoomend", () => mm.setView(map.getCenter(), Math.max(0, map.getZoom() - 4)));
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLiveLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, altitude: pos.coords.altitude, accuracy: pos.coords.accuracy });
          map.setView([pos.coords.latitude, pos.coords.longitude], 12);
          reverseGeocode(pos.coords.latitude, pos.coords.longitude).then((r) => r && setAddr(r));
        },
        () => {}, { enableHighAccuracy: true, timeout: 6000 },
      );
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      builtRef.current.forEach((b) => b.dispose());
      builtRef.current.clear();
      map.remove();
      mapRef.current = null;
      minimapRef.current?.remove();
      minimapRef.current = null;
    };
  }, []);

  // Base layer switching
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { base, overlay } = resolveBase(baseView);
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    if (overlayLayerRef.current) map.removeLayer(overlayLayerRef.current);
    baseLayerRef.current = L.tileLayer(base.url, { subdomains: base.subdomains, attribution: base.attribution, maxZoom: base.maxZoom }).addTo(map);
    if (overlay) {
      overlayLayerRef.current = L.tileLayer(overlay.url, { subdomains: overlay.subdomains, attribution: overlay.attribution, maxZoom: overlay.maxZoom }).addTo(map);
    } else overlayLayerRef.current = null;
    baseLayerRef.current.bringToBack();
  }, [baseView]);

  // Rebuild layers whenever state, timeframe, filters or bbox changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];

    // dispose all previous layers (simple + robust)
    builtRef.current.forEach((built, id) => {
      map.removeLayer(built.layer);
      built.dispose();
      builtRef.current.delete(id);
    });

    const counts: Record<string, number> = {};
    // Build only visible layers, ordered
    const active = LAYER_DEFS
      .filter((d) => layerState[d.id]?.visible)
      .sort((a, b) => a.order - b.order);

    // Skip cluster rebuild for occurrences when disabled — still build markers as layerGroup
    for (const def of active) {
      // when occurrences layer is active but clusters off, we still show individual markers via def.build (cluster group), acceptable.
      if (def.id === "occurrences" && !showClusters) continue;
      const built = def.build({ map, bbox, timeframe, filters });
      built.setOpacity(layerState[def.id].opacity);
      built.layer.addTo(map);
      builtRef.current.set(def.id, built);
      counts[def.id] = built.meta?.count ?? 0;
    }

    // If occurrences visible but clusters disabled, render plain markers
    if (layerState.occurrences?.visible && !showClusters) {
      const list = generateOccurrences(bbox, timeframeMs(timeframe));
      const g = L.layerGroup();
      for (const o of list) {
        L.circleMarker([o.lat, o.lng], {
          radius: 5, color: SEV_COLOR[o.severity], fillColor: SEV_COLOR[o.severity], fillOpacity: 0.85, weight: 1,
        }).bindPopup(`<b>${o.title}</b><br/>${o.neighborhood}`).addTo(g);
      }
      g.addTo(map);
      builtRef.current.set("occurrences", {
        layer: g, setOpacity: () => {}, dispose: () => g.clearLayers(),
        meta: { count: list.length },
      });
      counts.occurrences = list.length;
    }

    setLayerCounts(counts);

    // Heatmap: aggregate heatPoints from visible heat-emitting layers
    if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }
    if (showHeatmap) {
      const pts: [number, number, number][] = [];
      builtRef.current.forEach((built) => { if (built.heatPoints) pts.push(...built.heatPoints); });
      if (pts.length) {
        const heat = (L as unknown as { heatLayer: (p: unknown, o: unknown) => L.Layer })
          .heatLayer(pts, { radius: 24, blur: 18, maxZoom: 12 });
        heat.addTo(map);
        heatRef.current = heat;
      }
    }

    // Recompute ISA from occurrence-like points (map heat contributions)
    if (layerState.occurrences?.visible) {
      const raw = generateOccurrences(bbox, timeframeMs(timeframe));
      const list = raw.slice(0, 400);
      const occAsIsa = list.map((o) => ({
        id: o.id, kind: kindFromCategory(o.category), lat: o.lat, lng: o.lng,
        intensity: 0.25 + ["baixa","media","alta","critica"].indexOf(o.severity) * 0.25,
        timestamp: o.timestamp,
      }));
      setIsa(computeIsa(occAsIsa));
    } else {
      setIsa(null);
    }
  }, [layerState, timeframe, filters, bboxKey, showHeatmap, showClusters]);

  // Animation loop for tick-based layers
  useEffect(() => {
    const loop = (t: number) => {
      const dt = t - lastFrameRef.current;
      lastFrameRef.current = t;
      builtRef.current.forEach((b) => b.tick?.(dt));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const toggleLayer = (id: LayerId) => setLayerState((prev) => ({ ...prev, [id]: { ...prev[id], visible: !prev[id].visible } }));
  const setOpacity = (id: LayerId, opacity: number) => setLayerState((prev) => ({ ...prev, [id]: { ...prev[id], opacity } }));

  const submitSearch = async () => {
    const map = mapRef.current;
    if (!map || !searchQ.trim()) return;
    const coord = parseCoordinates(searchQ);
    if (coord) { map.setView([coord.lat, coord.lng], 13); reverseGeocode(coord.lat, coord.lng).then((r) => r && setAddr(r)); setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchAddress(searchQ);
      setSearchResults(results);
      if (results[0]) {
        const r = results[0];
        if (r.boundingbox) map.fitBounds([[r.boundingbox[0], r.boundingbox[2]], [r.boundingbox[1], r.boundingbox[3]]]);
        else map.setView([r.lat, r.lng], 13);
        setAddr(r);
      }
    } finally { setSearching(false); }
  };

  const goToMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const map = mapRef.current!;
      setLiveLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, altitude: pos.coords.altitude, accuracy: pos.coords.accuracy });
      map.setView([pos.coords.latitude, pos.coords.longitude], 14);
      reverseGeocode(pos.coords.latitude, pos.coords.longitude).then((r) => r && setAddr(r));
    }, () => {}, { enableHighAccuracy: true });
  };

  const rotate = useCallback((delta: number) => {
    setBearing((b) => (b + delta + 360) % 360);
  }, []);

  const filterOptions = useMemo(() => {
    const cats = new Set<string>(); const secs = new Set<string>();
    for (const d of LAYER_DEFS) if (d.id === "occurrences") {
      // Introspect from a generator sample
      const s = generateOccurrences([-90,-45,90,45], 24*3600_000).slice(0, 40);
      s.forEach((o) => { cats.add(o.category); secs.add(o.secretaria); });
    }
    return { cats: [...cats], secs: [...secs] };
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, typeof LAYER_DEFS> = {};
    for (const d of LAYER_DEFS) (g[d.category] ??= []).push(d);
    return g;
  }, []);

  return (
    <div className="gis-shell relative h-screen w-screen overflow-hidden bg-[color:var(--gis-bg)]">
      <div className="absolute inset-0" style={{ transform: `rotate(${bearing}deg)`, transformOrigin: "center center" }}>
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      {/* TOP BAR */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-2 p-3 md:flex-row md:items-start">
        <div className="pointer-events-auto gis-panel flex-1 p-2 md:max-w-xl">
          <div className="flex items-center gap-2">
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              placeholder="Endereço, CEP, cidade, país ou lat,lng"
              className="flex-1 bg-transparent px-3 py-2 text-sm text-[color:var(--gis-text)] outline-none placeholder:text-[color:var(--gis-muted)]" />
            <button className="gis-btn" onClick={submitSearch} disabled={searching}>{searching ? "…" : "Buscar"}</button>
            <button className="gis-btn" onClick={goToMyLocation} title="Minha localização">📍</button>
          </div>
          {searchResults.length > 1 && (
            <ul className="mt-2 max-h-56 overflow-auto text-xs">
              {searchResults.map((r, i) => (
                <li key={i}>
                  <button className="w-full rounded px-2 py-1 text-left hover:bg-white/5" onClick={() => {
                    const map = mapRef.current!;
                    if (r.boundingbox) map.fitBounds([[r.boundingbox[0], r.boundingbox[2]], [r.boundingbox[1], r.boundingbox[3]]]);
                    else map.setView([r.lat, r.lng], 13);
                    setAddr(r); setSearchResults([]);
                  }}>{r.displayName}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pointer-events-auto gis-panel flex flex-wrap gap-1 p-2">
          {BASE_VIEWS.map((v) => (
            <button key={v.id} className="gis-btn" data-active={baseView === v.id} onClick={() => setBaseView(v.id)}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* LEFT PANEL */}
      {leftOpen ? (
        <div className="absolute left-3 top-24 z-[500] w-80 max-h-[calc(100vh-8rem)] overflow-auto gis-panel p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">Camadas · LayerManager</span>
            <button className="gis-btn" onClick={() => setLeftOpen(false)}>×</button>
          </div>

          <div className="mb-3 flex flex-wrap gap-1">
            <button className="gis-btn" data-active={showHeatmap} onClick={() => setShowHeatmap((v) => !v)}>HeatMap</button>
            <button className="gis-btn" data-active={showClusters} onClick={() => setShowClusters((v) => !v)}>Clusters</button>
          </div>

          {Object.entries(grouped).map(([cat, defs]) => (
            <div key={cat} className="mb-3">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-[color:var(--gis-muted)]">
                {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]}
              </div>
              <ul className="space-y-2">
                {defs.map((d) => {
                  const st = layerState[d.id];
                  return (
                    <li key={d.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                      <div className="flex items-center gap-2">
                        <button className="gis-btn !px-2 !py-1" data-active={st.visible} onClick={() => toggleLayer(d.id)}>{d.icon}</button>
                        <span className="flex-1 text-xs">{d.label}</span>
                        <span className="gis-chip">{layerCounts[d.id] ?? 0}</span>
                      </div>
                      {st.visible && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] text-[color:var(--gis-muted)]">Opac.</span>
                          <input type="range" min={0.1} max={1} step={0.05} value={st.opacity}
                            onChange={(e) => setOpacity(d.id, parseFloat(e.target.value))}
                            className="flex-1 accent-[color:var(--gis-accent)]" />
                          <span className="text-[10px] tabular-nums text-[color:var(--gis-muted)] w-8 text-right">{Math.round(st.opacity * 100)}%</span>
                        </div>
                      )}
                      {st.visible && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {d.legend.map((l, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] text-[color:var(--gis-muted)]">
                              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: l.color }} />
                              {l.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="mt-4">
            <div className="mb-1 text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">Timeline</div>
            <div className="flex flex-wrap gap-1">
              {TIMEFRAMES.map((t) => (
                <button key={t.id} className="gis-btn" data-active={timeframe === t.id} onClick={() => setTimeframe(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">Filtros</div>
            <input value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              placeholder="Buscar em ocorrências…"
              className="w-full rounded-md bg-white/[0.05] px-2 py-1 text-xs outline-none placeholder:text-white/40" />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value as OccurrenceFilters["category"] })}
                className="rounded-md bg-white/[0.05] px-2 py-1 outline-none">
                <option value="all">Todas categorias</option>
                {filterOptions.cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value as OccurrenceFilters["severity"] })}
                className="rounded-md bg-white/[0.05] px-2 py-1 outline-none">
                <option value="all">Gravidade</option>
                <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
              </select>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as OccurrenceFilters["status"] })}
                className="rounded-md bg-white/[0.05] px-2 py-1 outline-none">
                <option value="all">Status</option>
                <option value="aberto">Aberto</option><option value="em_andamento">Em andamento</option><option value="resolvido">Resolvido</option>
              </select>
              <select value={filters.secretaria} onChange={(e) => setFilters({ ...filters, secretaria: e.target.value })}
                className="rounded-md bg-white/[0.05] px-2 py-1 outline-none">
                <option value="all">Secretaria</option>
                {filterOptions.secs.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {isa && (
            <div className="mt-4 rounded-lg border border-white/10 p-3">
              <div className="mb-1 text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">ISA</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: colorForScore(isa.score) }}>{isa.score}</span>
                <span className="text-sm">{isa.classification}</span>
                <span className="ml-auto gis-chip">{isa.trend === "up" ? "↑" : isa.trend === "down" ? "↓" : "→"}</span>
              </div>
              <p className="mt-2 text-xs text-[color:var(--gis-muted)]">{isa.explanation}</p>
            </div>
          )}
        </div>
      ) : (
        <button className="gis-btn absolute left-3 top-24 z-[500]" onClick={() => setLeftOpen(true)}>Camadas ▸</button>
      )}

      {/* RIGHT PANEL */}
      {rightOpen ? (
        <div className="absolute right-3 top-24 z-[500] w-72 max-h-[calc(100vh-8rem)] overflow-auto gis-panel p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">Localização</span>
            <button className="gis-btn" onClick={() => setRightOpen(false)}>×</button>
          </div>
          {addr ? (
            <div className="space-y-1 text-xs">
              <div><b>{addr.address.city || addr.address.town || addr.address.village || "—"}</b></div>
              <div>{[addr.address.suburb || addr.address.neighbourhood, addr.address.state, addr.address.country].filter(Boolean).join(", ")}</div>
              {addr.address.postcode && <div>CEP: {addr.address.postcode}</div>}
            </div>
          ) : (
            <div className="text-xs text-[color:var(--gis-muted)]">Aguardando localização…</div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-[color:var(--gis-muted)]">Lat</span><br />{cursor.lat.toFixed(5)}</div>
            <div><span className="text-[color:var(--gis-muted)]">Lng</span><br />{cursor.lng.toFixed(5)}</div>
            <div><span className="text-[color:var(--gis-muted)]">Zoom</span><br />{zoom}</div>
            <div><span className="text-[color:var(--gis-muted)]">Fuso</span><br />{timezone}</div>
            {liveLoc && (
              <>
                <div><span className="text-[color:var(--gis-muted)]">Precisão</span><br />±{Math.round(liveLoc.accuracy)}m</div>
                <div><span className="text-[color:var(--gis-muted)]">Altitude</span><br />{liveLoc.altitude != null ? `${Math.round(liveLoc.altitude)}m` : "—"}</div>
              </>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button className="gis-btn" onClick={() => rotate(-15)}>⟲</button>
            <div className="relative h-10 w-10 rounded-full border border-white/15">
              <div className="absolute left-1/2 top-1 h-4 w-[2px] -translate-x-1/2 bg-[color:var(--gis-accent)]"
                style={{ transform: `translateX(-50%) rotate(${bearing}deg)`, transformOrigin: "50% 100%" }} />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[color:var(--gis-muted)]">N</span>
            </div>
            <button className="gis-btn" onClick={() => rotate(15)}>⟳</button>
            <button className="gis-btn ml-auto" onClick={() => setBearing(0)}>0°</button>
          </div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider text-[color:var(--gis-muted)] mb-1">Camadas ativas</div>
            <ul className="text-xs space-y-1">
              {LAYER_DEFS.filter((d) => layerState[d.id]?.visible).map((d) => (
                <li key={d.id} className="flex justify-between">
                  <span>{d.icon} {d.label}</span>
                  <span className="text-[color:var(--gis-muted)]">{layerCounts[d.id] ?? 0}</span>
                </li>
              ))}
              {LAYER_DEFS.filter((d) => layerState[d.id]?.visible).length === 0 && (
                <li className="text-[color:var(--gis-muted)]">Nenhuma camada ativa</li>
              )}
            </ul>
          </div>
        </div>
      ) : (
        <button className="gis-btn absolute right-3 top-24 z-[500]" onClick={() => setRightOpen(true)}>◂ Localização</button>
      )}

      {/* MINIMAP */}
      <div className="absolute bottom-3 right-3 z-[500] gis-panel overflow-hidden p-1">
        <div ref={minimapContainerRef} style={{ width: 180, height: 120 }} />
      </div>

      {/* FOOTER CHIP */}
      <div className="absolute bottom-3 left-3 z-[500] gis-panel px-3 py-2 text-[11px] text-[color:var(--gis-muted)]">
        OSM · CARTO · Esri · OpenTopoMap · Nominatim · ViaCEP
      </div>
    </div>
  );
}

function kindFromCategory(cat: string): OccurrenceKind {
  const map: Record<string, OccurrenceKind> = {
    iluminacao: "sensor", buraco: "buraco", lixo: "lixo", arvore: "arvore_risco",
    agua: "agua_parada", esgoto: "poluicao", poste: "sensor", sinalizacao: "buraco",
    ruido: "poluicao", vandalismo: "lixo",
  };
  return map[cat] ?? "lixo";
}

function colorForScore(score: number): string {
  if (score >= 85) return "var(--isa-excellent)";
  if (score >= 70) return "var(--isa-good)";
  if (score >= 50) return "var(--isa-regular)";
  if (score >= 30) return "var(--isa-bad)";
  return "var(--isa-critical)";
}
