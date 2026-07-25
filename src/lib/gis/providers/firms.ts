import { swr } from "../cache";
import type { BBox } from "../simulated";
import { bus } from "@/geoos/core/bus";

export type FirePoint = {
  lat: number;
  lng: number;
  brightness: number;
  frp: number; // Fire Radiative Power (MW)
  confidence: string;
  satellite: string;
  date: string;
  time: string;
};

/**
 * NASA FIRMS active-fire feed via a server proxy. If `FIRMS_MAP_KEY` isn't
 * configured, the proxy returns an empty list so the map renders without
 * fake data (never fabricated).
 */
export async function fetchFires(bbox: BBox, days = 1): Promise<FirePoint[]> {
  const [w, s, e, n] = bbox.map((v) => Math.round(v * 4) / 4) as BBox;
  const key = `firms:${w}:${s}:${e}:${n}:${days}`;
  const started = performance.now();
  try {
    const data = await swr(key, 30 * 60_000, async () => {
      const url = `/api/public/firms?bbox=${w},${s},${e},${n}&days=${days}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { fires: FirePoint[]; hasKey: boolean };
      return j.fires ?? [];
    });
    bus.emit("api.status", {
      id: "firms",
      label: "NASA FIRMS",
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      ts: Date.now(),
      count: data.length,
    });
    return data;
  } catch (err) {
    bus.emit("api.status", {
      id: "firms",
      label: "NASA FIRMS",
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      ts: Date.now(),
      error: String(err),
    });
    return [];
  }
}

export function fireColor(frp: number): string {
  if (frp >= 100) return "#7f1d1d";
  if (frp >= 50) return "#dc2626";
  if (frp >= 20) return "#f97316";
  if (frp >= 5) return "#eab308";
  return "#facc15";
}
