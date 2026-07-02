export type LatLng = { lat: number; lng: number };

export type TileProvider = {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
  subdomains?: string;
  overlay?: boolean;
  requiresKey?: boolean;
};

export type OccurrenceKind =
  | "queimada"
  | "chuva"
  | "enchente"
  | "desmatamento"
  | "lixo"
  | "buraco"
  | "sensor"
  | "drone"
  | "arvore_risco"
  | "agua_parada"
  | "poluicao"
  | "erosao";

export type Occurrence = {
  id: string;
  kind: OccurrenceKind;
  lat: number;
  lng: number;
  intensity: number; // 0..1
  timestamp: number; // ms epoch
  city?: string;
  country?: string;
  description?: string;
};

export type LayerId =
  | "satellite"
  | "urban"
  | "environmental"
  | "climate"
  | "hydrology"
  | "vegetation"
  | "roads"
  | "buildings"
  | "transport"
  | "energy"
  | "occurrences"
  | "sensors"
  | "drones"
  | "fires"
  | "rain"
  | "floods"
  | "deforestation";

export type Timeframe = "today" | "7d" | "30d" | "12m";
