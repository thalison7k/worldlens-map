import type { Occurrence, OccurrenceKind, Timeframe } from "./types";

/**
 * DataSource contract — any future provider (NASA FIRMS, OpenWeather, INPE,
 * CEMADEN, IoT sensors, Lovable Cloud) implements this and plugs in without
 * touching the map UI.
 */
export interface DataSource {
  id: string;
  label: string;
  fetch(params: {
    bbox: [number, number, number, number]; // [west, south, east, north]
    kinds?: OccurrenceKind[];
    timeframe: Timeframe;
  }): Promise<Occurrence[]>;
}

const KIND_WEIGHTS: Record<OccurrenceKind, number> = {
  queimada: 6,
  chuva: 10,
  enchente: 3,
  desmatamento: 4,
  lixo: 12,
  buraco: 14,
  sensor: 8,
  drone: 2,
  arvore_risco: 5,
  agua_parada: 6,
  poluicao: 7,
  erosao: 3,
};

const KIND_LIST = Object.keys(KIND_WEIGHTS) as OccurrenceKind[];

function timeframeMs(tf: Timeframe): number {
  switch (tf) {
    case "today": return 24 * 3600_000;
    case "7d": return 7 * 24 * 3600_000;
    case "30d": return 30 * 24 * 3600_000;
    case "12m": return 365 * 24 * 3600_000;
  }
}

// Deterministic PRNG from bbox+timeframe so pans feel stable.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export const mockSource: DataSource = {
  id: "mock",
  label: "Dados simulados (demo)",
  async fetch({ bbox, kinds, timeframe }) {
    const [w, s, e, n] = bbox;
    const width = Math.abs(e - w);
    const height = Math.abs(n - s);
    // scale density with visible area — worldview shows fewer clusters
    const area = Math.max(width * height, 0.0001);
    const density = Math.min(600, Math.round(400 / Math.sqrt(area) + 40));
    const window = timeframeMs(timeframe);
    const now = Date.now();
    const allowed = kinds && kinds.length ? kinds : KIND_LIST;
    const rand = seeded(Math.floor((w + n) * 1000) + allowed.length + timeframe.length);
    const out: Occurrence[] = [];
    for (let i = 0; i < density; i++) {
      const kind = allowed[Math.floor(rand() * allowed.length)];
      const weight = KIND_WEIGHTS[kind];
      if (rand() * 20 > weight) continue;
      out.push({
        id: `mock-${i}-${kind}`,
        kind,
        lat: s + rand() * height,
        lng: w + rand() * width,
        intensity: 0.2 + rand() * 0.8,
        timestamp: now - Math.floor(rand() * window),
      });
    }
    return out;
  },
};
