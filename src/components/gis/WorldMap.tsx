import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.heat";

import { BASE_PROVIDERS, HYBRID_OVERLAY, resolveBase, type BaseView } from "@/lib/gis/providers";
import { mockSource } from "@/lib/gis/sources";
import type { LayerId, Occurrence, OccurrenceKind, Timeframe } from "@/lib/gis/types";
import { parseCoordinates, reverseGeocode, searchAddress, type GeocodeResult } from "@/lib/gis/geocoding";
import { computeIsa, type IsaResult } from "@/lib/gis/isa";

const BASE_VIEWS: { id: BaseView; label: string }[] = [
  { id: "street", label: "Rua" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "satellite", label: "Satélite" },
  { id: "terrain", label: "Terreno" },
  { id: "hybrid", label: "Híbrida" },
];

const ALL_LAYERS: { id: LayerId; label: string; kind?: OccurrenceKind; status: "live" | "mock" | "soon" }[] = [
  { id: "occurrences", label: "Ocorrências", status: "mock" },
  { id: "fires", label: "Queimadas", kind: "queimada", status: "mock" },
  { id: "rain", label: "Chuvas", kind: "chuva", status: "mock" },
  { id: "floods", label: "Enchentes", kind: "enchente", status: "mock" },
  { id: "deforestation", label: "Desmatamento", kind: "desmatamento", status: "mock" },
  { id: "sensors", label: "Sensores", kind: "sensor", status: "mock" },
  { id: "drones", label: "Drones", kind: "drone", status: "mock" },
  { id: "environmental", label: "Ambiental", status: "soon" },
  { id: "climate", label: "Climática", status: "soon" },
  { id: "hydrology", label: "Hidrológica", status: "soon" },
  { id: "vegetation", label: "Vegetação", status: "soon" },
  { id: "roads", label: "Estradas", status: "soon" },
  { id: "buildings", label: "Edificações", status: "soon" },
  { id: "transport", label: "Transporte", status: "soon" },
  { id: "energy", label: "Energia", status: "soon" },
  { id: "urban", label: "Urbana", status: "soon" },
  { id: "satellite", label: "Satélite (raster)", status: "soon" },
];

const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "12m", label: "12 meses" },
];

type LiveLocation = {
  lat: number;
  lng: number;
  altitude: number | null;
  accuracy: number;
};

export default function WorldMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLayerRef = useRef<L.TileLayer | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const minimapRef = useRef<L.Map | null>(null);
  const minimapContainerRef = useRef<HTMLDivElement>(null);
  const minimapBaseRef = useRef<L.TileLayer | null>(null);

  const [baseView, setBaseView] = useState<BaseView>("dark");
  const [activeLayers, setActiveLayers] = useState<Set<LayerId>>(
    () => new Set(["occurrences", "fires", "floods"]),
  );
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showClusters, setShowClusters] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>("7d");
  const [cursor, setCursor] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const [zoom, setZoom] = useState(2);
  const [bearing, setBearing] = useState(0);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [isa, setIsa] = useState<IsaResult | null>(null);
  const [liveLoc, setLiveLoc] = useState<LiveLocation | null>(null);
  const [addr, setAddr] = useState<GeocodeResult | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [0, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 20,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

    map.on("mousemove", (e) => setCursor({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.on("moveend zoomend", () => setZoom(map.getZoom()));

    // minimap
    if (minimapContainerRef.current) {
      const mm = L.map(minimapContainerRef.current, {
        attributionControl: false,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      }).setView([0, 0], 0);
      minimapRef.current = mm;
      minimapBaseRef.current = L.tileLayer(BASE_PROVIDERS.dark.url, {
        subdomains: BASE_PROVIDERS.dark.subdomains,
        attribution: "",
      }).addTo(mm);
      map.on("moveend zoomend", () => {
        mm.setView(map.getCenter(), Math.max(0, map.getZoom() - 4));
      });
    }

    // Try auto-locate; fallback to world view
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLiveLoc({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            altitude: pos.coords.altitude,
            accuracy: pos.coords.accuracy,
          });
          map.setView([pos.coords.latitude, pos.coords.longitude], 12);
          reverseGeocode(pos.coords.latitude, pos.coords.longitude).then((r) => r && setAddr(r));
        },
        () => { /* keep world view */ },
        { enableHighAccuracy: true, timeout: 6000 },
      );
    }

    return () => {
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
    baseLayerRef.current = L.tileLayer(base.url, {
      subdomains: base.subdomains,
      attribution: base.attribution,
      maxZoom: base.maxZoom,
    }).addTo(map);
    if (overlay) {
      overlayLayerRef.current = L.tileLayer(overlay.url, {
        subdomains: overlay.subdomains,
        attribution: overlay.attribution,
        maxZoom: overlay.maxZoom,
      }).addTo(map);
    } else {
      overlayLayerRef.current = null;
    }
  }, [baseView]);

  // Refetch occurrences on move / timeframe / layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const load = async () => {
      const b = map.getBounds();
      const bbox: [number, number, number, number] = [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ];
      const kinds: OccurrenceKind[] = [];
      for (const l of ALL_LAYERS) {
        if (l.kind && activeLayers.has(l.id)) kinds.push(l.kind);
      }
      const showAll = activeLayers.has("occurrences");
      const data = await mockSource.fetch({
        bbox,
        kinds: showAll ? undefined : kinds,
        timeframe,
      });
      if (!cancelled) {
        setOccurrences(data);
        setIsa(computeIsa(data));
      }
    };
    load();
    const onMove = () => load();
    map.on("moveend", onMove);
    return () => {
      cancelled = true;
      map.off("moveend", onMove);
    };
  }, [activeLayers, timeframe]);

  // Render clusters + heatmap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    if (showClusters && occurrences.length) {
      const group = L.markerClusterGroup({ chunkedLoading: true });
      for (const o of occurrences) {
        const m = L.circleMarker([o.lat, o.lng], {
          radius: 6,
          weight: 1,
          color: colorForKind(o.kind),
          fillColor: colorForKind(o.kind),
          fillOpacity: 0.7,
        }).bindPopup(
          `<strong>${labelForKind(o.kind)}</strong><br/>Intensidade: ${(o.intensity * 100).toFixed(0)}%<br/>${new Date(o.timestamp).toLocaleString()}`,
        );
        group.addLayer(m);
      }
      group.addTo(map);
      clusterRef.current = group;
    }
    if (showHeatmap && occurrences.length) {
      const pts: [number, number, number][] = occurrences.map((o) => [o.lat, o.lng, o.intensity]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heat = (L as any).heatLayer(pts, { radius: 22, blur: 18, maxZoom: 12 });
      heat.addTo(map);
      heatRef.current = heat;
    }
  }, [occurrences, showClusters, showHeatmap]);

  const toggleLayer = (id: LayerId) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitSearch = async () => {
    const map = mapRef.current;
    if (!map || !searchQ.trim()) return;
    const coord = parseCoordinates(searchQ);
    if (coord) {
      map.setView([coord.lat, coord.lng], 13);
      reverseGeocode(coord.lat, coord.lng).then((r) => r && setAddr(r));
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchAddress(searchQ);
      setSearchResults(results);
      if (results[0]) {
        const r = results[0];
        if (r.boundingbox) {
          map.fitBounds([
            [r.boundingbox[0], r.boundingbox[2]],
            [r.boundingbox[1], r.boundingbox[3]],
          ]);
        } else {
          map.setView([r.lat, r.lng], 13);
        }
        setAddr(r);
      }
    } finally {
      setSearching(false);
    }
  };

  const goToMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current!;
        setLiveLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
        });
        map.setView([pos.coords.latitude, pos.coords.longitude], 14);
        reverseGeocode(pos.coords.latitude, pos.coords.longitude).then((r) => r && setAddr(r));
      },
      () => {},
      { enableHighAccuracy: true },
    );
  };

  const rotate = (delta: number) => {
    const container = containerRef.current;
    if (!container) return;
    const next = (bearing + delta + 360) % 360;
    setBearing(next);
    const pane = container.querySelector<HTMLElement>(".leaflet-map-pane");
    if (pane) {
      pane.style.transformOrigin = "center center";
      pane.style.transform = `${pane.style.transform.replace(/rotate\([^)]+\)/, "")} rotate(${next}deg)`.trim();
    }
  };

  return (
    <div className="gis-shell relative h-screen w-screen overflow-hidden bg-[color:var(--gis-bg)]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar: search + base view */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-2 p-3 md:flex-row md:items-start">
        <div className="pointer-events-auto gis-panel flex-1 p-2 md:max-w-xl">
          <div className="flex items-center gap-2">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              placeholder="Buscar endereço, CEP, cidade, país ou lat,lng"
              className="flex-1 bg-transparent px-3 py-2 text-sm text-[color:var(--gis-text)] outline-none placeholder:text-[color:var(--gis-muted)]"
            />
            <button className="gis-btn" onClick={submitSearch} disabled={searching}>
              {searching ? "…" : "Buscar"}
            </button>
            <button className="gis-btn" onClick={goToMyLocation} title="Minha localização">
              📍
            </button>
          </div>
          {searchResults.length > 1 && (
            <ul className="mt-2 max-h-56 overflow-auto text-xs">
              {searchResults.map((r, i) => (
                <li key={i}>
                  <button
                    className="w-full rounded px-2 py-1 text-left hover:bg-white/5"
                    onClick={() => {
                      const map = mapRef.current!;
                      if (r.boundingbox) {
                        map.fitBounds([
                          [r.boundingbox[0], r.boundingbox[2]],
                          [r.boundingbox[1], r.boundingbox[3]],
                        ]);
                      } else {
                        map.setView([r.lat, r.lng], 13);
                      }
                      setAddr(r);
                      setSearchResults([]);
                    }}
                  >
                    {r.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pointer-events-auto gis-panel flex flex-wrap gap-1 p-2">
          {BASE_VIEWS.map((v) => (
            <button
              key={v.id}
              className="gis-btn"
              data-active={baseView === v.id}
              onClick={() => setBaseView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Left panel: layers + timeline + ISA */}
      {panelOpen && (
        <div className="absolute left-3 top-24 z-[500] w-72 max-h-[calc(100vh-8rem)] overflow-auto gis-panel p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">Camadas</span>
            <button className="gis-btn" onClick={() => setPanelOpen(false)}>×</button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            <button
              className="gis-btn"
              data-active={showHeatmap}
              onClick={() => setShowHeatmap((v) => !v)}
            >HeatMap</button>
            <button
              className="gis-btn"
              data-active={showClusters}
              onClick={() => setShowClusters((v) => !v)}
            >Clusters</button>
          </div>
          <ul className="space-y-1">
            {ALL_LAYERS.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeLayers.has(l.id)}
                    onChange={() => toggleLayer(l.id)}
                    disabled={l.status === "soon"}
                  />
                  <span className={l.status === "soon" ? "opacity-50" : ""}>{l.label}</span>
                </label>
                <span className="gis-chip">{l.status === "live" ? "ao vivo" : l.status === "mock" ? "demo" : "em breve"}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <div className="mb-1 text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">Timeline</div>
            <div className="flex flex-wrap gap-1">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.id}
                  className="gis-btn"
                  data-active={timeframe === t.id}
                  onClick={() => setTimeframe(t.id)}
                >{t.label}</button>
              ))}
            </div>
          </div>

          {isa && (
            <div className="mt-4 rounded-lg border border-white/10 p-3">
              <div className="mb-1 text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">ISA — Índice de Saúde Ambiental</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: colorForScore(isa.score) }}>{isa.score}</span>
                <span className="text-sm">{isa.classification}</span>
                <span className="ml-auto gis-chip">
                  {isa.trend === "up" ? "↑ melhora" : isa.trend === "down" ? "↓ piora" : "→ estável"}
                </span>
              </div>
              <p className="mt-2 text-xs text-[color:var(--gis-muted)]">{isa.explanation}</p>
              {isa.breakdown.length > 0 && (
                <div className="mt-2 space-y-1">
                  {isa.breakdown.slice(0, 4).map((b) => (
                    <div key={b.kind} className="flex items-center justify-between text-xs">
                      <span>{labelForKind(b.kind)}</span>
                      <span className="text-[color:var(--gis-muted)]">{b.contribution}</span>
                    </div>
                  ))}
                </div>
              )}
              {isa.suggestions.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs text-[color:var(--gis-muted)]">
                  {isa.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {!panelOpen && (
        <button
          className="gis-btn absolute left-3 top-24 z-[500]"
          onClick={() => setPanelOpen(true)}
        >Camadas ▸</button>
      )}

      {/* Right HUD: location panel */}
      <div className="absolute right-3 top-24 z-[500] w-72 max-h-[calc(100vh-8rem)] overflow-auto gis-panel p-3 text-sm">
        <div className="mb-2 text-xs uppercase tracking-wider text-[color:var(--gis-muted)]">Localização</div>
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
              <div><span className="text-[color:var(--gis-muted)]">Precisão GPS</span><br />±{Math.round(liveLoc.accuracy)}m</div>
              <div><span className="text-[color:var(--gis-muted)]">Altitude</span><br />{liveLoc.altitude != null ? `${Math.round(liveLoc.altitude)}m` : "—"}</div>
            </>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className="gis-btn" onClick={() => rotate(-15)}>⟲</button>
          <div className="relative h-10 w-10 rounded-full border border-white/15">
            <div
              className="absolute left-1/2 top-1 h-4 w-[2px] -translate-x-1/2 bg-[color:var(--gis-accent)]"
              style={{ transform: `translateX(-50%) rotate(${bearing}deg)`, transformOrigin: "50% 100%" }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[color:var(--gis-muted)]">N</span>
          </div>
          <button className="gis-btn" onClick={() => rotate(15)}>⟳</button>
          <span className="ml-auto text-xs text-[color:var(--gis-muted)]">{bearing}°</span>
        </div>
      </div>

      {/* Mini map */}
      <div className="absolute bottom-3 right-3 z-[500] gis-panel overflow-hidden p-1">
        <div ref={minimapContainerRef} style={{ width: 180, height: 120 }} />
      </div>

      {/* Bottom-left chip: providers info */}
      <div className="absolute bottom-3 left-3 z-[500] gis-panel px-3 py-2 text-[11px] text-[color:var(--gis-muted)]">
        Provedores: OSM · CARTO · Esri · OpenTopoMap · Nominatim · ViaCEP
        <span className="ml-2 opacity-60">(Mapbox/Google prontos p/ integrar)</span>
      </div>
    </div>
  );
}

function colorForKind(kind: OccurrenceKind): string {
  const map: Record<OccurrenceKind, string> = {
    queimada: "#ff5a1f",
    chuva: "#3b82f6",
    enchente: "#0ea5e9",
    desmatamento: "#a16207",
    lixo: "#8b5cf6",
    buraco: "#f59e0b",
    sensor: "#10b981",
    drone: "#22d3ee",
    arvore_risco: "#84cc16",
    agua_parada: "#06b6d4",
    poluicao: "#ef4444",
    erosao: "#b45309",
  };
  return map[kind];
}

function labelForKind(kind: OccurrenceKind): string {
  const map: Record<OccurrenceKind, string> = {
    queimada: "Queimada",
    chuva: "Chuva",
    enchente: "Enchente",
    desmatamento: "Desmatamento",
    lixo: "Lixo irregular",
    buraco: "Buraco",
    sensor: "Sensor",
    drone: "Drone",
    arvore_risco: "Árvore em risco",
    agua_parada: "Água parada",
    poluicao: "Poluição",
    erosao: "Erosão",
  };
  return map[kind];
}

function colorForScore(score: number): string {
  if (score >= 85) return "var(--isa-excellent)";
  if (score >= 70) return "var(--isa-good)";
  if (score >= 50) return "var(--isa-regular)";
  if (score >= 30) return "var(--isa-bad)";
  return "var(--isa-critical)";
}
