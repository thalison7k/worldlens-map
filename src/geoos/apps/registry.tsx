import { lazy } from "react";
import { BarChart3, History, LayoutDashboard, Layers, Radio, Sparkles } from "lucide-react";
import type { GeoApp } from "@/geoos/core/types";

const LayersApp = lazy(() => import("./LayersApp"));
const DashboardApp = lazy(() => import("./DashboardApp"));
const AnalyticsApp = lazy(() => import("./AnalyticsApp"));
const AIAssistantApp = lazy(() => import("./AIAssistantApp"));
const IoTSensorsApp = lazy(() => import("./IoTSensorsApp"));
const TimeMachineApp = lazy(() => import("./TimeMachineApp"));


export const APPS: GeoApp[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Visão executiva ambiental em tempo real.",
    icon: LayoutDashboard,
    category: "core",
    color: "200 90% 60%",
    defaultSize: { width: 380, height: 640 },
    singleton: true,
    component: DashboardApp,
  },
  {
    id: "layers",
    name: "Camadas",
    description: "Monitoramento ambiental em tempo real.",
    icon: Layers,
    category: "core",
    color: "155 60% 55%",
    defaultSize: { width: 380, height: 620 },
    singleton: true,
    component: LayersApp,
  },
  {
    id: "analytics",
    name: "Analytics",
    description: "Gráficos em tempo real da região visível.",
    icon: BarChart3,
    category: "core",
    color: "280 70% 65%",
    defaultSize: { width: 420, height: 640 },
    singleton: true,
    component: AnalyticsApp,
  },
  {
    id: "timemachine",
    name: "Time Machine",
    description: "Reconstrói e anima o histórico ambiental da área visível.",
    icon: History,
    category: "core",
    color: "25 90% 60%",
    defaultSize: { width: 400, height: 640 },
    singleton: true,
    component: TimeMachineApp,
  },
  {
    id: "iot",
    name: "Sensores IoT",
    description: "Sensores do dispositivo publicados na nuvem em tempo real.",
    icon: Radio,
    category: "core",
    color: "195 90% 60%",
    defaultSize: { width: 380, height: 620 },
    singleton: true,
    component: IoTSensorsApp,
  },
  {
    id: "ai",
    name: "Geo AI",
    description: "Assistente de IA contextual (Lovable AI).",
    icon: Sparkles,
    category: "core",
    color: "45 90% 60%",
    defaultSize: { width: 420, height: 560 },
    singleton: true,
    component: AIAssistantApp,
  },
];


export const APPS_BY_ID: Record<string, GeoApp> = Object.fromEntries(APPS.map((a) => [a.id, a]));
