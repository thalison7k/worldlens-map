/**
 * Histórico ambiental (Time Machine).
 *
 * Fonte: Open-Meteo Archive (reanálise ERA5) e Open-Meteo Air Quality —
 * ambas públicas, sem chave, com CORS liberado. Retorna séries diárias
 * para o centro da área visível do mapa.
 */

export type HistoryDay = {
  /** YYYY-MM-DD */
  date: string;
  tmax: number | null;
  tmin: number | null;
  precip: number | null;
  wind: number | null;
  pm25: number | null;
};

const cache = new Map<string, { at: number; data: HistoryDay[] }>();
const TTL = 10 * 60_000;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Série diária dos últimos `days` dias para o ponto informado. */
export async function fetchHistory(lat: number, lng: number, days: number): Promise<HistoryDay[]> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const end = new Date(Date.now() - 24 * 3600_000);
  const start = new Date(end.getTime() - (days - 1) * 24 * 3600_000);

  const archiveUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&start_date=${iso(start)}&end_date=${iso(end)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=UTC`;

  const airUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&hourly=pm2_5&past_days=${Math.min(92, days)}&forecast_days=1&timezone=UTC`;

  const [archive, air] = await Promise.all([
    fetch(archiveUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(airUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  // média diária de PM2.5 a partir da série horária
  const pmByDay = new Map<string, { sum: number; n: number }>();
  const times: string[] = air?.hourly?.time ?? [];
  const values: Array<number | null> = air?.hourly?.pm2_5 ?? [];
  times.forEach((t, i) => {
    const v = values[i];
    if (v == null) return;
    const d = t.slice(0, 10);
    const acc = pmByDay.get(d) ?? { sum: 0, n: 0 };
    acc.sum += v;
    acc.n += 1;
    pmByDay.set(d, acc);
  });

  const dates: string[] = archive?.daily?.time ?? [];
  const out: HistoryDay[] = dates.map((date, i) => {
    const pm = pmByDay.get(date);
    return {
      date,
      tmax: archive?.daily?.temperature_2m_max?.[i] ?? null,
      tmin: archive?.daily?.temperature_2m_min?.[i] ?? null,
      precip: archive?.daily?.precipitation_sum?.[i] ?? null,
      wind: archive?.daily?.wind_speed_10m_max?.[i] ?? null,
      pm25: pm ? pm.sum / pm.n : null,
    };
  });

  cache.set(key, { at: Date.now(), data: out });
  return out;
}

/** Classificação simples de PM2.5 (OMS 2021). */
export function pmLevel(v: number | null): { label: string; color: string } {
  if (v == null) return { label: "sem dado", color: "#64748b" };
  if (v <= 15) return { label: "Bom", color: "#22c55e" };
  if (v <= 35) return { label: "Moderado", color: "#eab308" };
  if (v <= 55) return { label: "Ruim", color: "#f97316" };
  return { label: "Crítico", color: "#ef4444" };
}
