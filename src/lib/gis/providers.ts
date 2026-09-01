import type { TileProvider } from "./types";

/** Base maps públicos usados pelo GeoOS — nenhum deles exige chave. */
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
    // Sentinel-2 cloudless da EOX. A antiga base Esri começou a devolver
    // tiles com “API KEY REQUIRED / Map data not yet available”.
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
    attribution: "Sentinel-2 cloudless © EOX · Copernicus",
    maxZoom: 17,
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
