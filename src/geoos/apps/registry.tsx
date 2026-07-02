import { lazy } from "react";
import {
  Map, Layers, Bot, Leaf, Flame, Droplets, CloudSun, Building2, Cable, Zap, Bus,
  HeartPulse, GraduationCap, Satellite, Radar, Cpu, FileText, Boxes, Users, Settings,
  Compass, Sparkles, Rocket, ClipboardList, Radio, LayoutDashboard,
} from "lucide-react";
import type { GeoApp } from "@/geoos/core/types";

const Placeholder = lazy(() => import("./PlaceholderApp"));
const GeoMapsApp = lazy(() => import("./GeoMapsApp"));
const AnalysisApp = lazy(() => import("./AnalysisApp"));
const CommandCenterApp = lazy(() => import("./CommandCenterApp"));
const CopilotApp = lazy(() => import("./CopilotApp"));
const LayersApp = lazy(() => import("./LayersApp"));

export const APPS: GeoApp[] = [
  { id: "geo-maps", name: "Geo Maps", description: "Mapa global navegável em tempo real.", icon: Map, category: "core", color: "195 85% 60%", defaultSize: { width: 960, height: 640 }, singleton: true, component: GeoMapsApp },
  { id: "layers", name: "Layers", description: "Gerenciador de camadas geoespaciais.", icon: Layers, category: "core", color: "220 80% 65%", defaultSize: { width: 380, height: 620 }, singleton: true, component: LayersApp },
  { id: "geo-ai", name: "Geo AI Copilot", description: "Controle o GeoOS por linguagem natural.", icon: Bot, category: "intel", color: "265 80% 70%", defaultSize: { width: 460, height: 620 }, singleton: true, component: CopilotApp },
  { id: "analysis", name: "Analysis Engine", description: "Desenhe, meça e agregue dados por região.", icon: Compass, category: "intel", color: "170 60% 55%", defaultSize: { width: 560, height: 640 }, component: AnalysisApp },
  { id: "command-center", name: "Command Center", description: "Central de operações em tempo real.", icon: LayoutDashboard, category: "intel", color: "0 70% 60%", defaultSize: { width: 960, height: 620 }, singleton: true, component: CommandCenterApp },
  { id: "smart-inspect", name: "Smart Inspect", description: "Inspeção detalhada de qualquer objeto.", icon: Radar, category: "intel", color: "300 60% 65%", defaultSize: { width: 420, height: 640 }, component: Placeholder },
  { id: "temporal", name: "Temporal Engine", description: "Timeline mundial com animação temporal.", icon: Sparkles, category: "intel", color: "45 90% 60%", defaultSize: { width: 720, height: 320 }, component: Placeholder },
  { id: "geo-story", name: "Geo Story", description: "Relatórios executivos por IA.", icon: FileText, category: "intel", color: "210 60% 65%", defaultSize: { width: 720, height: 640 }, component: Placeholder },
  { id: "simulation", name: "Simulation Engine", description: "Simule intervenções e veja o impacto.", icon: Rocket, category: "intel", color: "285 70% 65%", defaultSize: { width: 720, height: 560 }, component: Placeholder },
  { id: "environmental", name: "Environmental", description: "Qualidade do ar, vegetação, ISA.", icon: Leaf, category: "environment", color: "155 60% 55%", component: Placeholder },
  { id: "fire-monitor", name: "Fire Monitor", description: "Queimadas ativas globalmente.", icon: Flame, category: "environment", color: "20 90% 60%", component: Placeholder },
  { id: "flood-monitor", name: "Flood Monitor", description: "Alertas de enchente e hidrologia.", icon: Droplets, category: "environment", color: "200 85% 60%", component: Placeholder },
  { id: "weather", name: "Weather", description: "Radar meteorológico global.", icon: CloudSun, category: "environment", color: "210 70% 65%", component: Placeholder },
  { id: "urban-analytics", name: "Urban Analytics", description: "Análise urbana e mobilidade.", icon: Building2, category: "urban", color: "230 60% 65%", component: Placeholder },
  { id: "infrastructure", name: "Infrastructure", description: "Ativos e infraestrutura.", icon: Cable, category: "infra", color: "245 40% 60%", component: Placeholder },
  { id: "energy", name: "Energy", description: "Rede elétrica, subestações.", icon: Zap, category: "infra", color: "50 90% 60%", component: Placeholder },
  { id: "transport", name: "Transport", description: "Frotas, rotas, ônibus.", icon: Bus, category: "urban", color: "195 80% 60%", component: Placeholder },
  { id: "health", name: "Health", description: "Rede de saúde e UBS.", icon: HeartPulse, category: "urban", color: "0 70% 65%", component: Placeholder },
  { id: "education", name: "Education", description: "Rede de ensino.", icon: GraduationCap, category: "urban", color: "280 55% 65%", component: Placeholder },
  { id: "satellite", name: "Satellite Center", description: "Imagens orbitais.", icon: Satellite, category: "environment", color: "180 55% 60%", component: Placeholder },
  { id: "drone-center", name: "Drone Center", description: "Frota de drones.", icon: Radio, category: "infra", color: "260 60% 65%", component: Placeholder },
  { id: "iot-center", name: "IoT Center", description: "Sensores em tempo real.", icon: Cpu, category: "infra", color: "155 55% 55%", component: Placeholder },
  { id: "reports", name: "Reports", description: "Relatórios e exportações.", icon: ClipboardList, category: "system", color: "40 60% 60%", component: Placeholder },
  { id: "assets", name: "Assets", description: "Inventário de ativos.", icon: Boxes, category: "system", color: "220 40% 65%", component: Placeholder },
  { id: "users", name: "Users", description: "Usuários e permissões.", icon: Users, category: "system", color: "265 40% 65%", component: Placeholder },
  { id: "settings", name: "Settings", description: "Preferências do GeoOS.", icon: Settings, category: "system", color: "220 15% 65%", component: Placeholder },
];

export const APPS_BY_ID: Record<string, GeoApp> = Object.fromEntries(APPS.map((a) => [a.id, a]));
