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
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  },
  dark: {
    id: "dark",
    label: "Dark",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
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

export type BaseView =
  | "street"
  | "light"
  | "dark"
  | "satellite"
  | "terrain"
  | "hybrid";

export function resolveBase(view: BaseView): { base: TileProvider; overlay?: TileProvider } {
  // A antiga sobreposição híbrida CARTO passou a exigir chave. Mantemos a
  // imagem Sentinel-2 limpa, sem solicitar nenhum tile restrito.
  if (view === "hybrid") return { base: BASE_PROVIDERS.satellite };
  return { base: BASE_PROVIDERS[view] };
}
