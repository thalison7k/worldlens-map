import mitt from "mitt";

export type TimelineRange = "today" | "24h" | "7d" | "30d" | "12m" | "years";

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
  "map.setOpacity": { layerId: string; opacity: number };
  // system
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
  "analysis.result": { region: string; metrics: Record<string, string | number> };
};

export const bus = mitt<GeoOSEvents>();
