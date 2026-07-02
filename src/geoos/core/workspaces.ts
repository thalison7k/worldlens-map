import type { Workspace } from "./types";

export const WORKSPACES: Workspace[] = [
  { id: "environment", name: "Ambiental", description: "Monitoramento ambiental integrado.", accent: "155 60% 55%", apps: ["geo-maps", "layers", "fire-monitor", "flood-monitor", "environmental", "analysis", "temporal", "geo-story"], layers: ["occurrences", "fires", "rain", "vegetation"] },
  { id: "civil-defense", name: "Defesa Civil", description: "Alertas, incidentes e resposta.", accent: "25 90% 60%", apps: ["geo-maps", "command-center", "flood-monitor", "fire-monitor", "smart-inspect", "temporal", "reports"], layers: ["occurrences", "floods", "fires", "rain"] },
  { id: "city-hall", name: "Prefeitura", description: "Gestão urbana municipal.", accent: "220 80% 65%", apps: ["geo-maps", "urban-analytics", "infrastructure", "reports", "assets", "analysis", "geo-story"], layers: ["occurrences", "buildings", "roads"] },
  { id: "mobility", name: "Mobilidade", description: "Trânsito, transporte, frotas.", accent: "195 85% 60%", apps: ["geo-maps", "transport", "urban-analytics", "command-center"], layers: ["transport", "roads"] },
  { id: "energy", name: "Energia", description: "Redes, subestações, ativos.", accent: "50 90% 60%", apps: ["geo-maps", "energy", "infrastructure", "iot-center", "reports"], layers: ["energy"] },
  { id: "planning", name: "Planejamento Urbano", description: "Simulações e projeções.", accent: "280 60% 65%", apps: ["geo-maps", "urban-analytics", "analysis", "simulation", "geo-story"], layers: ["buildings", "roads", "vegetation"] },
  { id: "agriculture", name: "Agricultura", description: "NDVI, safras, clima.", accent: "100 60% 55%", apps: ["geo-maps", "environmental", "weather", "satellite", "temporal"], layers: ["vegetation", "rain"] },
  { id: "climate", name: "Clima", description: "Monitoramento climático.", accent: "200 70% 60%", apps: ["geo-maps", "weather", "satellite", "temporal", "environmental"], layers: ["rain", "vegetation"] },
  { id: "security", name: "Segurança", description: "Câmeras, sensores, incidentes.", accent: "0 70% 60%", apps: ["geo-maps", "command-center", "iot-center", "smart-inspect"], layers: ["occurrences", "sensors"] },
  { id: "satellite", name: "Satélite", description: "Imagens e sensoriamento remoto.", accent: "170 60% 55%", apps: ["geo-maps", "satellite", "drone-center", "temporal"], layers: ["vegetation"] },
];

export const WORKSPACES_BY_ID = Object.fromEntries(WORKSPACES.map((w) => [w.id, w]));
