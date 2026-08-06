import mitt from "mitt";

export type TimelineRange = "today" | "24h" | "7d" | "30d" | "12m" | "years";

export type ApiStatus = {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  ts: number;
  count?: number;
  error?: string;
};

export type MapExportFormat = "png" | "geojson" | "csv" | "kml";

export type GeoOSEvents = {
  // apps / windows
  "app.open": { appId: string; payload?: unknown };
  "app.close": { appId: string };
  "app.focus": { appId: string };
  "app.minimize": { appId: string };
  // map kernel intents
  "map.flyTo": { lat: number; lng: number; zoom?: number };
  "map.setBase": { base: string };
  "map.toggleLayer": { layerId: string; visible?: boolean };
  "map.bbox": { west: number; south: number; east: number; north: number; zoom: number };
  "map.layerBuilt": { layerId: string; count: number; updatedAt: number };
  "map.setOpacity": { layerId: string; opacity: number };
  "map.refreshLayer": { layerId?: string };
  "map.cursor": { lat: number; lng: number };
  "map.click": { lat: number; lng: number };
  "map.export": { format: MapExportFormat };
  "map.fullscreen": undefined;
  "map.measure": { mode: "distance" | "area" | "off" };
  "map.measureResult": { mode: "distance" | "area"; value: number; unit: string };
  "layers.setRefreshInterval": { ms: number };
  // system
  "api.status": ApiStatus;
  "notify": { title: string; message?: string; level?: "info" | "warn" | "error" | "success" };
  "palette.open": undefined;
  "activity.toggle": undefined;
  "workspace.change": { id: string };
  // cross-app channels
  "search.query": { q: string; source?: string };
  "search.result": { q: string; kind: "place" | "app" | "workspace" | "layer"; label: string; payload?: unknown };
  "filters.change": { key: string; value: unknown };
  "theme.change": { theme: "dark" | "light"; variant?: string };
  "timeline.change": { t: number; range: TimelineRange };
  /** Time Machine: imagem de satélite histórica sobre o mapa (data ISO YYYY-MM-DD). */
  "timemachine.date": { date: string | null };
  "analysis.result": { region: string; metrics: Record<string, string | number> };
};

export const bus = mitt<GeoOSEvents>();
