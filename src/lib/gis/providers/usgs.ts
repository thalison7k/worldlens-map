import { swr } from "../cache";
import { bus } from "@/geoos/core/bus";

export type Quake = {
  id: string;
  lat: number;
  lng: number;
  depthKm: number;
  mag: number;
  place: string;
  time: number;
  url: string;
};

type UsgsFeature = {
  id: string;
  properties: { mag: number; place: string; time: number; url: string };
  geometry: { coordinates: [number, number, number] };
};
type UsgsResp = { features: UsgsFeature[] };

/** USGS all-day earthquake feed (public, no key). */
export async function fetchEarthquakes(range: "hour" | "day" | "week" | "month" = "day"): Promise<Quake[]> {
  const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${range}.geojson`;
  const started = performance.now();
  try {
    const data = await swr(`usgs:${range}`, 5 * 60_000, async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`USGS ${r.status}`);
      const j = (await r.json()) as UsgsResp;
      return j.features.map((f) => ({
        id: f.id,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        depthKm: f.geometry.coordinates[2],
        mag: f.properties.mag,
        place: f.properties.place,
        time: f.properties.time,
        url: f.properties.url,
      }));
    });
    bus.emit("api.status", { id: "usgs", label: "USGS Earthquakes", ok: true, latencyMs: Math.round(performance.now() - started), ts: Date.now(), count: data.length });
    return data;
  } catch (err) {
    bus.emit("api.status", { id: "usgs", label: "USGS Earthquakes", ok: false, latencyMs: Math.round(performance.now() - started), ts: Date.now(), error: String(err) });
    return [];
  }
}

export function magColor(mag: number): string {
  if (mag >= 6) return "#7f1d1d";
  if (mag >= 5) return "#dc2626";
  if (mag >= 4) return "#f97316";
  if (mag >= 3) return "#eab308";
  if (mag >= 2) return "#22c55e";
  return "#0ea5e9";
}
