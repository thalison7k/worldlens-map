import { swr } from "../cache";
import type { BBox } from "../simulated";

export type Poi = {
  id: string;
  lat: number;
  lng: number;
  kind: "hospital" | "school" | "police" | "fire_station" | "pharmacy";
  name: string;
  tags: Record<string, string>;
};

const KIND_QUERY: Record<Poi["kind"], string> = {
  hospital: 'amenity=hospital',
  school: 'amenity=school',
  police: 'amenity=police',
  fire_station: 'amenity=fire_station',
  pharmacy: 'amenity=pharmacy',
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

/**
 * Fetches POIs of `kind` inside `bbox` from Overpass.
 * Bbox is snapped to 0.5° to make the cache key stable across small pans.
 */
export async function fetchPois(bbox: BBox, kind: Poi["kind"], limit = 200): Promise<Poi[]> {
  const [w, s, e, n] = bbox.map((v) => Math.round(v * 2) / 2) as BBox;
  const key = `overpass:${kind}:${w}:${s}:${e}:${n}`;
  return swr(key, 30 * 60_000, async () => {
    const q = `[out:json][timeout:15];(node[${KIND_QUERY[kind]}](${s},${w},${n},${e});way[${KIND_QUERY[kind]}](${s},${w},${n},${e}););out center ${limit};`;
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
          .map((el): Poi | null => {
            const lat = el.lat ?? el.center?.lat;
            const lng = el.lon ?? el.center?.lon;
            if (lat == null || lng == null) return null;
            return {
              id: `${el.type}/${el.id}`,
              lat,
              lng,
              kind,
              name: el.tags?.name ?? `(${kind})`,
              tags: el.tags ?? {},
            };
          })
          .filter((x): x is Poi => !!x);
      } catch { /* try next */ }
    }
    throw new Error("Overpass unreachable");
  });
}

export const POI_STYLE: Record<Poi["kind"], { color: string; icon: string; label: string }> = {
  hospital: { color: "#ef4444", icon: "🏥", label: "Hospital" },
  school: { color: "#3b82f6", icon: "🏫", label: "Escola" },
  police: { color: "#0ea5e9", icon: "🚓", label: "Polícia" },
  fire_station: { color: "#f97316", icon: "🚒", label: "Bombeiros" },
  pharmacy: { color: "#10b981", icon: "💊", label: "Farmácia" },
};
