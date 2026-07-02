import type { TileProvider } from "./types";

/**
 * Base map providers. All free / no-key by default.
 * Mapbox & Google are declared as stubs so the UI can list them; enabling
 * only requires adding the tile URL + key.
 */
export const BASE_PROVIDERS: Record<string, TileProvider> = {
  street: {
    id: "street",
    label: "Rua",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
    subdomains: "abc",
  },
  light: {
    id: "light",
    label: "Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap © CARTO",
    maxZoom: 20,
    subdomains: "abcd",
  },
  dark: {
    id: "dark",
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap © CARTO",
    maxZoom: 20,
    subdomains: "abcd",
  },
  satellite: {
    id: "satellite",
    label: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  terrain: {
    id: "terrain",
    label: "Terreno",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors, SRTM | © OpenTopoMap",
    maxZoom: 17,
    subdomains: "abc",
  },
};

/** Overlay used for the "Hybrid" view (labels + roads on top of imagery). */
export const HYBRID_OVERLAY: TileProvider = {
  id: "hybrid-overlay",
  label: "Rótulos",
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
  attribution: "© OpenStreetMap © CARTO",
  maxZoom: 20,
  subdomains: "abcd",
  overlay: true,
};

/** Placeholder providers, ready to be enabled with a key later. */
export const FUTURE_PROVIDERS = {
  mapbox: { id: "mapbox", label: "Mapbox (requer chave)", requiresKey: true },
  google: { id: "google", label: "Google Maps (requer chave)", requiresKey: true },
};

export type BaseView =
  | "street"
  | "light"
  | "dark"
  | "satellite"
  | "terrain"
  | "hybrid";

export function resolveBase(view: BaseView): { base: TileProvider; overlay?: TileProvider } {
  if (view === "hybrid") return { base: BASE_PROVIDERS.satellite, overlay: HYBRID_OVERLAY };
  return { base: BASE_PROVIDERS[view] };
}
