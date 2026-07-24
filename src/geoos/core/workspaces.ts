import type { Workspace } from "./types";

/**
 * Single environmental workspace — the platform now ships one functional
 * module (Layers / Monitoramento Ambiental). Workspace switching UI was
 * removed with the legacy apps; this export is kept as a stable default.
 */
export const WORKSPACES: Workspace[] = [
  {
    id: "environment",
    name: "Ambiental",
    description: "Monitoramento ambiental integrado.",
    accent: "155 60% 55%",
    apps: ["layers"],
    layers: ["earthquakes", "air_quality", "el_nino"],
  },
];

export const WORKSPACES_BY_ID = Object.fromEntries(WORKSPACES.map((w) => [w.id, w]));
