import { swr } from "../cache";
import type { BBox } from "../simulated";
import { bus } from "@/geoos/core/bus";

export type WeatherPoint = {
  id: string;
  lat: number;
  lng: number;
  city: string;
  temp: number;
  feels: number;
  humidity: number;
  windSpeed: number;
  windDir: number;
  gust: number;
  pressure: number;
  uv: number;
  visibility: number;
  cloud: number;
  code: number;
};

/**
 * A curated set of global cities keeps the sample small and consistent
 * (Open-Meteo is free, no key, CORS-enabled). We filter by bbox before
 * fetching so panning the map surfaces relevant weather without hammering
 * the API.
 */
const GLOBAL_CITIES: { city: string; lat: number; lng: number }[] = [
  { city: "São Paulo", lat: -23.55, lng: -46.63 },
  { city: "Rio de Janeiro", lat: -22.91, lng: -43.17 },
  { city: "Brasília", lat: -15.79, lng: -47.88 },
  { city: "Manaus", lat: -3.12, lng: -60.02 },
  { city: "Salvador", lat: -12.97, lng: -38.5 },
  { city: "Fortaleza", lat: -3.72, lng: -38.54 },
  { city: "Belo Horizonte", lat: -19.92, lng: -43.94 },
  { city: "Porto Alegre", lat: -30.03, lng: -51.23 },
  { city: "Belém", lat: -1.46, lng: -48.5 },
  { city: "Buenos Aires", lat: -34.6, lng: -58.38 },
  { city: "Santiago", lat: -33.45, lng: -70.67 },
  { city: "Lima", lat: -12.05, lng: -77.04 },
  { city: "Bogotá", lat: 4.71, lng: -74.07 },
  { city: "Ciudad de México", lat: 19.43, lng: -99.13 },
  { city: "New York", lat: 40.71, lng: -74.01 },
  { city: "Los Angeles", lat: 34.05, lng: -118.24 },
  { city: "Chicago", lat: 41.88, lng: -87.63 },
  { city: "Toronto", lat: 43.65, lng: -79.38 },
  { city: "Londres", lat: 51.51, lng: -0.13 },
  { city: "Paris", lat: 48.86, lng: 2.35 },
  { city: "Madrid", lat: 40.42, lng: -3.7 },
  { city: "Lisboa", lat: 38.72, lng: -9.14 },
  { city: "Berlim", lat: 52.52, lng: 13.41 },
  { city: "Roma", lat: 41.9, lng: 12.5 },
  { city: "Moscou", lat: 55.75, lng: 37.62 },
  { city: "Istambul", lat: 41.01, lng: 28.98 },
  { city: "Cairo", lat: 30.04, lng: 31.24 },
  { city: "Nairóbi", lat: -1.29, lng: 36.82 },
  { city: "Joanesburgo", lat: -26.2, lng: 28.05 },
  { city: "Lagos", lat: 6.52, lng: 3.38 },
  { city: "Dubai", lat: 25.2, lng: 55.27 },
  { city: "Mumbai", lat: 19.08, lng: 72.88 },
  { city: "Deli", lat: 28.61, lng: 77.21 },
  { city: "Bangkok", lat: 13.76, lng: 100.5 },
  { city: "Singapura", lat: 1.35, lng: 103.82 },
  { city: "Jacarta", lat: -6.21, lng: 106.85 },
  { city: "Tóquio", lat: 35.68, lng: 139.65 },
  { city: "Seul", lat: 37.57, lng: 126.98 },
  { city: "Pequim", lat: 39.9, lng: 116.4 },
  { city: "Xangai", lat: 31.23, lng: 121.47 },
  { city: "Sydney", lat: -33.87, lng: 151.21 },
  { city: "Melbourne", lat: -37.81, lng: 144.96 },
  { city: "Auckland", lat: -36.85, lng: 174.76 },
];

type OpenMeteoResp = {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    pressure_msl: number;
    weather_code: number;
    cloud_cover: number;
    visibility?: number;
  };
  daily?: { uv_index_max?: number[] };
};

export async function fetchWeather(bbox: BBox, max = 24): Promise<WeatherPoint[]> {
  const [w, s, e, n] = bbox;
  const inBbox = GLOBAL_CITIES.filter((c) => c.lng >= w && c.lng <= e && c.lat >= s && c.lat <= n);
  const pool = inBbox.length > 0 ? inBbox : GLOBAL_CITIES;
  const picks = pool.slice(0, max);
  const key = `openmeteo:${picks.map((p) => p.city).join(",")}`;
  const started = performance.now();
  try {
    const data = await swr(key, 10 * 60_000, async () => {
      const latitudes = picks.map((p) => p.lat).join(",");
      const longitudes = picks.map((p) => p.lng).join(",");
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,weather_code,cloud_cover,visibility&daily=uv_index_max&timezone=auto&forecast_days=1`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const payload = (await r.json()) as OpenMeteoResp | OpenMeteoResp[];
      const rows = Array.isArray(payload) ? payload : [payload];
      return rows
        .map((j, index) => {
          const p = picks[index];
          const c = j.current;
          if (!p || !c) return null;
          return {
            id: `${p.city}`,
            lat: p.lat,
            lng: p.lng,
            city: p.city,
            temp: c.temperature_2m,
            feels: c.apparent_temperature,
            humidity: c.relative_humidity_2m,
            windSpeed: c.wind_speed_10m,
            windDir: c.wind_direction_10m,
            gust: c.wind_gusts_10m,
            pressure: c.pressure_msl,
            uv: j.daily?.uv_index_max?.[0] ?? 0,
            visibility: (c.visibility ?? 0) / 1000,
            cloud: c.cloud_cover,
            code: c.weather_code,
          } as WeatherPoint;
        })
        .filter((x): x is WeatherPoint => x !== null);
    });
    bus.emit("api.status", {
      id: "openmeteo",
      label: "Open-Meteo",
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      ts: Date.now(),
      count: data.length,
    });
    return data;
  } catch (err) {
    bus.emit("api.status", {
      id: "openmeteo",
      label: "Open-Meteo",
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      ts: Date.now(),
      error: String(err),
    });
    return [];
  }
}

export function tempColor(t: number): string {
  if (t >= 35) return "#dc2626";
  if (t >= 28) return "#f97316";
  if (t >= 22) return "#eab308";
  if (t >= 15) return "#22c55e";
  if (t >= 5) return "#38bdf8";
  return "#818cf8";
}
