import { swr } from "../cache";
import type { BBox } from "../simulated";
import { bus } from "@/geoos/core/bus";

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
  aqi?: number;
  pm10?: number;
  o3?: number;
  no2?: number;
  co?: number;
  so2?: number;
};

type AqResp = {
  latitude: number;
  longitude: number;
  current?: {
    time?: string;
    pm2_5?: number;
    pm10?: number;
    us_aqi?: number;
    ozone?: number;
    nitrogen_dioxide?: number;
    carbon_monoxide?: number;
    sulphur_dioxide?: number;
  };
};

/**
 * Qualidade do ar real e global via Open-Meteo Air Quality (CAMS).
 * Sem chave, com CORS liberado e cobertura mundial — amostramos uma grade
 * dentro da bbox atual, então QUALQUER região do planeta retorna dados
 * medidos/reanalisados (nunca simulados).
 */
export async function fetchAirStations(bbox: BBox, limit = 200): Promise<AirStation[]> {
  const [w, s, e, n] = bbox;
  const spanLng = Math.min(Math.abs(e - w), 360);
  const spanLat = Math.min(Math.abs(n - s), 170);
  // grade adaptativa: no máximo 5x5 pontos (25 chamadas em 1 request)
  const cols = 5;
  const rows = 5;
  const pts: { lat: number; lng: number }[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lng = w + (spanLng * (i + 0.5)) / cols;
      const lat = s + (spanLat * (j + 0.5)) / rows;
      if (lat < -89 || lat > 89) continue;
      pts.push({ lat: Math.round(lat * 100) / 100, lng: Math.round(((lng + 540) % 360) - 180, ) });
    }
  }
  const picks = pts.slice(0, Math.min(limit, 25));
  const key = `airq:${picks.map((p) => `${p.lat},${p.lng.toFixed(2)}`).join("|")}`;
  const started = performance.now();
  try {
    const data = await swr(key, 10 * 60_000, async () => {
      const url =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${picks.map((p) => p.lat).join(",")}` +
        `&longitude=${picks.map((p) => Number(p.lng.toFixed(2))).join(",")}` +
        `&current=pm2_5,pm10,us_aqi,ozone,nitrogen_dioxide,carbon_monoxide,sulphur_dioxide`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`AirQuality ${r.status}`);
      const raw = (await r.json()) as AqResp | AqResp[];
      const list = Array.isArray(raw) ? raw : [raw];
      const out: AirStation[] = [];
      list.forEach((loc, i) => {
        const c = loc.current;
        if (!c || c.pm2_5 == null) return;
        out.push({
          id: `aq-${i}-${loc.latitude.toFixed(2)}-${loc.longitude.toFixed(2)}`,
          lat: loc.latitude,
          lng: loc.longitude,
          city: `Ponto ${i + 1}`,
          country: "CAMS / Open-Meteo",
          parameter: "pm25",
          value: c.pm2_5,
          unit: "µg/m³",
          updated: c.time ? Date.parse(`${c.time}Z`) : Date.now(),
          aqi: c.us_aqi,
          pm10: c.pm10,
          o3: c.ozone,
          no2: c.nitrogen_dioxide,
          co: c.carbon_monoxide,
          so2: c.sulphur_dioxide,
        });
      });
      return out;
    });
    bus.emit("api.status", { id: "openaq", label: "Ar (CAMS)", ok: true, latencyMs: Math.round(performance.now() - started), ts: Date.now(), count: data.length });
    return data;
  } catch (err) {
    bus.emit("api.status", { id: "openaq", label: "Ar (CAMS)", ok: false, latencyMs: Math.round(performance.now() - started), ts: Date.now(), error: String(err) });
    return [];
  }
}

export function pm25Color(v: number): string {
  if (v > 150) return "#7f1d1d";
  if (v > 55) return "#b91c1c";
  if (v > 35) return "#ea580c";
  if (v > 12) return "#eab308";
  return "#22c55e";
}
