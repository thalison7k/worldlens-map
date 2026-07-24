import { lazy } from "react";
import { Layers } from "lucide-react";
import type { GeoApp } from "@/geoos/core/types";

const LayersApp = lazy(() => import("./LayersApp"));

/**
 * The platform exposes a single functional module: Layers (environmental
 * monitoring). Every other legacy app was removed to keep the surface
 * consistent with the real-data providers wired into the MapKernel.
 */
export const APPS: GeoApp[] = [
  {
    id: "layers",
    name: "Camadas Ambientais",
    description: "Monitoramento ambiental em tempo real.",
    icon: Layers,
    category: "core",
    color: "155 60% 55%",
    defaultSize: { width: 380, height: 620 },
    singleton: true,
    component: LayersApp,
  },
];

export const APPS_BY_ID: Record<string, GeoApp> = Object.fromEntries(APPS.map((a) => [a.id, a]));
