import { swr } from "../cache";
import type { BBox } from "../simulated";

export type Plane = {
  icao: string;
  callsign: string;
  country: string;
  lat: number;
  lng: number;
  altitude: number; // meters
  velocity: number; // m/s
  heading: number; // deg
  onGround: boolean;
  updated: number;
};

type OpenSkyResp = {
  time: number;
  states: (string | number | boolean | null)[][] | null;
};

/**
 * OpenSky Network — live aircraft states within a bbox (no key required).
 * https://openskynetwork.github.io/opensky-api/rest.html
 */
export async function fetchPlanes(bbox: BBox, maxAgeMs = 20_000): Promise<Plane[]> {
  const [w, s, e, n] = bbox;
  const key = `opensky:${Math.round(w)}:${Math.round(s)}:${Math.round(e)}:${Math.round(n)}`;
  return swr(key, maxAgeMs, async () => {
    const url = `https://opensky-network.org/api/states/all?lamin=${s}&lomin=${w}&lamax=${n}&lomax=${e}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`OpenSky ${r.status}`);
    const data = (await r.json()) as OpenSkyResp;
    const out: Plane[] = [];
    for (const st of data.states ?? []) {
      const lng = st[5] as number | null;
      const lat = st[6] as number | null;
      if (lat == null || lng == null) continue;
      out.push({
        icao: String(st[0] ?? ""),
        callsign: String(st[1] ?? "").trim() || "—",
        country: String(st[2] ?? ""),
        lat,
        lng,
        onGround: Boolean(st[8]),
        velocity: Number(st[9] ?? 0),
        heading: Number(st[10] ?? 0),
        altitude: Number(st[7] ?? st[13] ?? 0),
        updated: (data.time ?? Date.now() / 1000) * 1000,
      });
    }
    return out;
  });
}
