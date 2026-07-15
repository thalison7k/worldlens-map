import { swr } from "../cache";
import type { BBox } from "../simulated";

export type BusStop = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  ref?: string;
  operator?: string;
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** OSM bus stops (real, worldwide) via Overpass. */
export async function fetchBusStops(bbox: BBox, limit = 300): Promise<BusStop[]> {
  const [w, s, e, n] = bbox.map((v) => Math.round(v * 4) / 4) as BBox;
  // Guard: at low zoom the bbox is huge and Overpass will time out.
  const spanLat = n - s;
  const spanLng = e - w;
  if (spanLat > 4 || spanLng > 4) return [];
  const key = `bus_stop:${w}:${s}:${e}:${n}`;
  return swr(key, 30 * 60_000, async () => {
    const q = `[out:json][timeout:15];(node[highway=bus_stop](${s},${w},${n},${e}););out ${limit};`;
    for (const url of ENDPOINTS) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(q),
        });
        if (!r.ok) continue;
        const data = (await r.json()) as { elements: OverpassElement[] };
        return data.elements
          .map((el): BusStop | null => {
            const lat = el.lat ?? el.center?.lat;
            const lng = el.lon ?? el.center?.lon;
            if (lat == null || lng == null) return null;
            return {
              id: `${el.type}/${el.id}`,
              lat,
              lng,
              name: el.tags?.name ?? "Parada de ônibus",
              ref: el.tags?.ref,
              operator: el.tags?.operator,
            };
          })
          .filter((x): x is BusStop => !!x);
      } catch { /* try next */ }
    }
    throw new Error("Overpass unreachable");
  });
}
