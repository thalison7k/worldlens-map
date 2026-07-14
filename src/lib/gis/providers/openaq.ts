import { swr } from "../cache";
import type { BBox } from "../simulated";

export type AirStation = {
  id: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  parameter: string;
  value: number;
  unit: string;
  updated: number;
};

type OpenAqLocation = {
  id: number;
  name?: string;
  coordinates?: { latitude: number; longitude: number };
  country?: { name?: string; code?: string };
  locality?: string;
  sensors?: { parameter: { name: string; units: string }; latest?: { value: number; datetime?: { utc?: string } } }[];
};

/** OpenAQ v3 (public, no key required for /locations). */
export async function fetchAirStations(bbox: BBox, limit = 200): Promise<AirStation[]> {
  const [w, s, e, n] = bbox.map((v) => Math.round(v * 4) / 4) as BBox;
  const key = `openaq:${w}:${s}:${e}:${n}`;
  return swr(key, 10 * 60_000, async () => {
    const url = `https://api.openaq.org/v3/locations?bbox=${w},${s},${e},${n}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`OpenAQ ${r.status}`);
    const data = (await r.json()) as { results: OpenAqLocation[] };
    const out: AirStation[] = [];
    for (const loc of data.results ?? []) {
      const c = loc.coordinates;
      if (!c) continue;
      const pm = loc.sensors?.find((sn) => sn.parameter.name === "pm25") ?? loc.sensors?.[0];
      if (!pm?.latest) continue;
      out.push({
        id: String(loc.id),
        lat: c.latitude,
        lng: c.longitude,
        city: loc.locality ?? loc.name ?? "-",
        country: loc.country?.name ?? loc.country?.code ?? "-",
        parameter: pm.parameter.name,
        value: pm.latest.value,
        unit: pm.parameter.units,
        updated: pm.latest.datetime?.utc ? Date.parse(pm.latest.datetime.utc) : Date.now(),
      });
    }
    return out;
  });
}

export function pm25Color(v: number): string {
  if (v > 150) return "#7f1d1d";
  if (v > 55) return "#b91c1c";
  if (v > 35) return "#ea580c";
  if (v > 12) return "#eab308";
  return "#22c55e";
}
