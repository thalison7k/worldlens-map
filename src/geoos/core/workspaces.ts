import type { Workspace } from "./types";

/**
 * Environmental-only workspaces. Every workspace is scoped to environmental
 * monitoring — urban/mobility/energy/security modules were removed.
 */
export const WORKSPACES: Workspace[] = [
  { id: "environment", name: "Ambiental", description: "Monitoramento ambiental integrado.", accent: "155 60% 55%", apps: ["geo-maps", "layers", "fire-monitor", "flood-monitor", "environmental", "analysis", "temporal", "geo-story"], layers: ["occurrences", "fires", "rain", "vegetation", "environmental", "air_quality"] },
  { id: "fires", name: "Queimadas & Focos", description: "Focos ativos, radiação e histórico.", accent: "20 90% 55%", apps: ["geo-maps", "fire-monitor", "temporal", "analysis", "reports"], layers: ["fires", "vegetation", "drones"] },
  { id: "deforestation", name: "Desmatamento", description: "NDVI, cobertura e perdas.", accent: "35 55% 45%", apps: ["geo-maps", "environmental", "temporal", "analysis", "geo-story"], layers: ["deforestation", "vegetation"] },
  { id: "air-quality", name: "Qualidade do Ar", description: "PM2.5, PM10, AQI regional.", accent: "170 55% 55%", apps: ["geo-maps", "environmental", "iot-center", "reports"], layers: ["environmental", "air_quality", "sensors"] },
  { id: "climate", name: "Clima & Chuva", description: "Radar de chuva, vento, temperatura.", accent: "200 70% 60%", apps: ["geo-maps", "weather", "temporal", "environmental"], layers: ["rain", "climate", "floods"] },
  { id: "floods", name: "Enchentes & Rios", description: "Alertas hidrológicos e nível de rios.", accent: "215 75% 60%", apps: ["geo-maps", "flood-monitor", "iot-center", "temporal"], layers: ["floods", "rain", "sensors"] },
  { id: "iot", name: "Sensores IoT", description: "Rede de sensores ambientais.", accent: "155 70% 55%", apps: ["geo-maps", "iot-center", "analysis", "reports"], layers: ["sensors", "environmental"] },
  { id: "drones", name: "Drones Ambientais", description: "Sobrevoos e coletas em campo.", accent: "185 75% 60%", apps: ["geo-maps", "drone-center", "temporal", "analysis"], layers: ["drones", "fires", "deforestation"] },
];

export const WORKSPACES_BY_ID = Object.fromEntries(WORKSPACES.map((w) => [w.id, w]));
