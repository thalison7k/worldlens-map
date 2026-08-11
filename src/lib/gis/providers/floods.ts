import { swr } from "../cache";
import type { BBox } from "../simulated";
import { bus } from "@/geoos/core/bus";

/**
 * Áreas com risco de alagamento / enchente — dados reais, sem chave.
 *
 * Combina três fontes públicas da Open-Meteo (CORS liberado):
 *  - Flood API (GloFAS v4): vazão fluvial prevista vs. média histórica;
 *  - Forecast API: chuva acumulada em 24 h / 72 h e chuva horária máxima;
 *  - Elevation API (Copernicus DEM): altitude do terreno — áreas baixas
 *    próximas a rios alagam primeiro.
 *
 * O índice de risco (0–100) é calculado no cliente e alimenta a camada
 * animada do mapa, a central de alertas e o histórico (Time Machine).
 */

export type FloodRiskLevel = "extremo" | "alto" | "moderado" | "baixo";

export type FloodCell = {
  id: string;
  lat: number;
  lng: number;
  /** Índice 0–100. */
  risk: number;
  level: FloodRiskLevel;
  /** Chuva acumulada prevista nas próximas 24 h (mm). */
  rain24: number;
  /** Chuva acumulada prevista em 72 h (mm). */
  rain72: number;
  /** Pico horário previsto (mm/h). */
  rainPeak: number;
  /** Vazão do rio mais próximo (m³/s) — GloFAS. */
  discharge: number | null;
  /** Média histórica da vazão para a data (m³/s). */
  dischargeMean: number | null;
  /** Razão vazão/média — > 1 indica rio acima do normal. */
  dischargeRatio: number | null;
  /** Altitude do terreno (m). */
  elevation: number | null;
  updated: number;
};

export const FLOOD_LEVEL_COLOR: Record<FloodRiskLevel, string> = {
  extremo: "#7c2d12",
  alto: "#dc2626",
  moderado: "#f59e0b",
  baixo: "#38bdf8",
};

export const FLOOD_LEVEL_LABEL: Record<FloodRiskLevel, string> = {
  extremo: "Extremo — evacuação preventiva",
  alto: "Alto — alagamento provável",
  moderado: "Moderado — pontos de alagamento",
  baixo: "Baixo — sem indício de enchente",
};

function levelOf(risk: number): FloodRiskLevel {
  if (risk >= 75) return "extremo";
  if (risk >= 55) return "alto";
  if (risk >= 32) return "moderado";
  return "baixo";
}

/** Grade regular de amostragem dentro da área visível. */
function grid(bbox: BBox, n: number) {
  const [w, s, e, nn] = bbox;
  const pts: { lat: number; lng: number }[] = [];
  const step = 1 / (n + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      pts.push({ lat: s + (nn - s) * (i * step), lng: w + (e - w) * (j * step) });
    }
  }
  return pts;
}

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Calcula o risco de enchente para a área visível do mapa.
 * `cells` controla a densidade da grade (cells × cells pontos).
 */
export async function fetchFloodRisk(bbox: BBox, cells = 4): Promise<FloodCell[]> {
  const [w, s, e, n] = bbox;
  const span = Math.max(Math.abs(e - w), Math.abs(n - s));
  // Em escala continental a grade fica grosseira demais para ter sentido
  // hidrológico — reduz a densidade e mantém a chamada barata.
  const size = span > 40 ? 3 : cells;
  const pts = grid(bbox, size);
  const key = `flood:${bbox.map((v) => v.toFixed(1)).join(",")}:${size}`;
  const started = performance.now();

  try {
    const data = await swr(key, 15 * 60_000, async () => {
      const lats = pts.map((p) => p.lat.toFixed(3)).join(",");
      const lngs = pts.map((p) => p.lng.toFixed(3)).join(",");

      const forecastUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
        `&hourly=precipitation&daily=precipitation_sum&forecast_days=3&timezone=UTC`;
      const floodUrl =
        `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lngs}` +
        `&daily=river_discharge,river_discharge_mean&forecast_days=3`;
      const elevUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

      const [fc, fl, el] = await Promise.all([
        fetch(forecastUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(floodUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(elevUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      const fcRows = Array.isArray(fc) ? fc : fc ? [fc] : [];
      const flRows = Array.isArray(fl) ? fl : fl ? [fl] : [];
      const elevs: number[] = el?.elevation ?? [];

      const out: FloodCell[] = pts.map((p, i) => {
        const f = fcRows[i] ?? fcRows[0];
        const g = flRows[i] ?? flRows[0];
        const hourly: number[] = (f?.hourly?.precipitation ?? []).map(num);
        const daily: number[] = (f?.daily?.precipitation_sum ?? []).map(num);
        const rain24 = daily[0] ?? 0;
        const rain72 = daily.slice(0, 3).reduce((a: number, b: number) => a + b, 0);
        const rainPeak = hourly.slice(0, 24).reduce((a, b) => Math.max(a, b), 0);

        const dRaw = g?.daily?.river_discharge as Array<number | null> | undefined;
        const mRaw = g?.daily?.river_discharge_mean as Array<number | null> | undefined;
        const discharge = dRaw?.find((v) => v != null) ?? null;
        const dischargeMean = mRaw?.find((v) => v != null) ?? null;
        const ratio =
          discharge != null && dischargeMean != null && dischargeMean > 0
            ? discharge / dischargeMean
            : null;
        const elevation = Number.isFinite(elevs[i]) ? elevs[i] : null;

        // Pesos: chuva 72 h (0–45), pico horário (0–25), rio acima da média
        // (0–25) e bônus por terreno baixo/plano (0–10).
        let risk = 0;
        risk += Math.min(45, (rain72 / 120) * 45);
        risk += Math.min(25, (rainPeak / 20) * 25);
        if (ratio != null) risk += Math.min(25, Math.max(0, (ratio - 1) / 1.5) * 25);
        if (elevation != null && elevation < 60 && rain72 > 8) risk += 10;
        else if (elevation != null && elevation < 200 && rain72 > 20) risk += 5;
        risk = Math.round(Math.min(100, risk));

        return {
          id: `flood:${p.lat.toFixed(2)}:${p.lng.toFixed(2)}`,
          lat: p.lat,
          lng: p.lng,
          risk,
          level: levelOf(risk),
          rain24,
          rain72,
          rainPeak,
          discharge,
          dischargeMean,
          dischargeRatio: ratio,
          elevation,
          updated: Date.now(),
        };
      });

      return out;
    });

    bus.emit("api.status", {
      id: "floods",
      label: "Open-Meteo Flood (GloFAS)",
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      ts: Date.now(),
      count: data.length,
    });
    return data;
  } catch (err) {
    bus.emit("api.status", {
      id: "floods",
      label: "Open-Meteo Flood (GloFAS)",
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      ts: Date.now(),
      error: String(err),
    });
    return [];
  }
}

/** Histórico de chuva diária para checar enchentes passadas no ponto. */
export async function fetchFloodHistory(lat: number, lng: number, days = 30) {
  const key = `flood:hist:${lat.toFixed(2)},${lng.toFixed(2)},${days}`;
  return swr(key, 30 * 60_000, async () => {
    const end = new Date(Date.now() - 24 * 3600_000);
    const start = new Date(end.getTime() - (days - 1) * 24 * 3600_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      `&start_date=${iso(start)}&end_date=${iso(end)}&daily=precipitation_sum&timezone=UTC`;
    const j = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const dates: string[] = j?.daily?.time ?? [];
    const vals: Array<number | null> = j?.daily?.precipitation_sum ?? [];
    return dates.map((date, i) => ({ date, precip: vals[i] ?? 0 }));
  });
}
