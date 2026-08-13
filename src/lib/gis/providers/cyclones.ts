import { swr } from "../cache";
import { bus } from "@/geoos/core/bus";

export type Cyclone = {
  id: string;
  name: string;
  classification: string;
  basin: string;
  lat: number;
  lng: number;
  intensityKt: number | null;
  pressureMb: number | null;
  movementDir: number | null;
  movementSpeedKt: number | null;
  lastUpdate: string | null;
  source?: string;
};

/** Ciclones tropicais ativos (NOAA NHC), via proxy interno. */
export async function fetchCyclones(): Promise<Cyclone[]> {
  const started = performance.now();
  try {
    const data = await swr("cyclones:active", 10 * 60_000, async () => {
      const r = await fetch("/api/public/cyclones");
      if (!r.ok) throw new Error(`Cyclones ${r.status}`);
      return (await r.json()) as { storms: Cyclone[] };
    });
    const storms = data.storms ?? [];
    bus.emit("api.status", {
      id: "cyclones", label: "NOAA NHC", ok: true,
      latencyMs: Math.round(performance.now() - started), ts: Date.now(), count: storms.length,
    });
    return storms;
  } catch (err) {
    bus.emit("api.status", {
      id: "cyclones", label: "NOAA NHC", ok: false,
      latencyMs: Math.round(performance.now() - started), ts: Date.now(), error: String(err),
    });
    return [];
  }
}

/** Escala Saffir-Simpson a partir da intensidade em nós. */
export function cycloneCategory(kt: number | null): { label: string; cat: number; color: string } {
  const v = kt ?? 0;
  if (v >= 137) return { label: "Furacão categoria 5", cat: 5, color: "#7f1d1d" };
  if (v >= 113) return { label: "Furacão categoria 4", cat: 4, color: "#b91c1c" };
  if (v >= 96) return { label: "Furacão categoria 3", cat: 3, color: "#dc2626" };
  if (v >= 83) return { label: "Furacão categoria 2", cat: 2, color: "#ea580c" };
  if (v >= 64) return { label: "Furacão categoria 1", cat: 1, color: "#f59e0b" };
  if (v >= 34) return { label: "Tempestade tropical", cat: 0, color: "#38bdf8" };
  return { label: "Depressão tropical", cat: 0, color: "#94a3b8" };
}

/**
 * Nome do fenômeno conforme a bacia: furacão (Atlântico / Pacífico Leste),
 * tufão (Pacífico Oeste) ou ciclone tropical (Índico / Oceania).
 */
export function stormKind(c: Pick<Cyclone, "lat" | "lng" | "intensityKt" | "classification">): string {
  const kt = c.intensityKt ?? 0;
  const cls = (c.classification || "").toUpperCase();
  if (kt < 34 && !/HU|TY|MH/.test(cls)) return "Depressão tropical";
  if (kt < 64 && !/HU|TY|MH/.test(cls)) return "Tempestade tropical";
  const west = c.lng >= 100 && c.lng <= 180 && c.lat > 0;
  if (west || cls.includes("TY")) return "Tufão";
  const indian = c.lng >= 30 && c.lng < 100;
  if (indian || c.lat < 0) return "Ciclone tropical";
  return "Furacão";
}


/** Direção cardinal legível a partir do rumo em graus. */
export function bearingLabel(deg: number | null): string {
  if (deg == null) return "estacionário";
  const dirs = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}
