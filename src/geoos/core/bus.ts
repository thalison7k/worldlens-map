import mitt from "mitt";

export type GeoOSEvents = {
  "app.open": { appId: string; payload?: unknown };
  "app.close": { appId: string };
  "app.focus": { appId: string };
  "app.minimize": { appId: string };
  "map.flyTo": { lat: number; lng: number; zoom?: number };
  "map.setBase": { base: string };
  "map.toggleLayer": { layerId: string; visible?: boolean };
  "notify": { title: string; message?: string; level?: "info" | "warn" | "error" | "success" };
  "palette.open": undefined;
  "activity.toggle": undefined;
  "workspace.change": { id: string };
};

export const bus = mitt<GeoOSEvents>();
