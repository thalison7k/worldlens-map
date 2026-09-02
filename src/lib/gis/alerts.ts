import { fetchFires } from "@/lib/gis/providers/firms";
import { fetchEarthquakes } from "@/lib/gis/providers/usgs";
import { fetchAirStations } from "@/lib/gis/providers/openaq";
import { fetchCyclones, cycloneCategory, bearingLabel } from "@/lib/gis/providers/cyclones";
import { fetchFloodRisk, FLOOD_LEVEL_LABEL } from "@/lib/gis/providers/floods";
import type { BBox } from "@/lib/gis/simulated";

/**
 * Motor único de alertas ambientais — compartilhado pela Central de Alertas e
 * pela Central Ambiental (Dashboard), garantindo que o cruzamento por
 * localidade use exatamente as mesmas regras de severidade.
 */
export type AlertLevel = "critico" | "alto" | "moderado";

export type EnvAlert = {
  id: string;
  kind: "ciclone" | "queimada" | "sismo" | "ar" | "enchente";
  level: AlertLevel;
  title: string;
  detail: string;
  lat: number;
  lng: number;
  when: number;
  km?: number;
};

export type AlertFocus = { lat: number; lng: number; radiusKm: number } | null;

export const LEVEL_STYLE: Record<AlertLevel, { color: string; label: string }> = {
  critico: { color: "#dc2626", label: "Crítico" },
  alto: { color: "#f97316", label: "Alto" },
  moderado: { color: "#eab308", label: "Moderado" },
};

export const KIND_ICON: Record<EnvAlert["kind"], string> = {
  ciclone: "🌀", queimada: "🔥", sismo: "🌐", ar: "🌫️", enchente: "🌊",
};

export function insideBox(b: BBox, lat: number, lng: number) {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

export function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Varre todas as fontes no bbox e devolve os alertas ordenados por severidade. */
export async function buildAlerts(box: BBox, focus: AlertFocus): Promise<EnvAlert[]> {
  const [cyclones, fires, quakes, air, floods] = await Promise.all([
    fetchCyclones().catch(() => []),
    fetchFires(box, 1).catch(() => []),
    fetchEarthquakes("day").catch(() => []),
    fetchAirStations(box, 120).catch(() => []),
    fetchFloodRisk(box, 4).catch(() => []),
  ]);

  const out: EnvAlert[] = [];

  for (const s of cyclones) {
    const { label, cat } = cycloneCategory(s.intensityKt);
    out.push({
      id: `cyc:${s.id}`,
      kind: "ciclone",
      level: cat >= 3 ? "critico" : cat >= 1 ? "alto" : "moderado",
      title: `${s.name} · ${label}`,
      detail: `${s.intensityKt ?? "?"} kt · ${s.pressureMb ?? "?"} hPa · rumo ${bearingLabel(s.movementDir)}`,
      lat: s.lat, lng: s.lng,
      when: s.lastUpdate ? new Date(s.lastUpdate).getTime() : Date.now(),
    });
  }

  for (const f of fires.filter((f) => f.frp >= 40).slice(0, 12)) {
    out.push({
      id: `fire:${f.lat.toFixed(3)}:${f.lng.toFixed(3)}`,
      kind: "queimada",
      level: f.frp >= 120 ? "critico" : "alto",
      title: `Foco de calor · FRP ${f.frp.toFixed(0)} MW`,
      detail: `Confiança ${f.confidence ?? "n/d"} · ${f.lat.toFixed(2)}, ${f.lng.toFixed(2)}`,
      lat: f.lat, lng: f.lng,
      when: Date.now(),
    });
  }

  for (const q of quakes.filter((q) => q.mag >= 4 && insideBox(box, q.lat, q.lng)).slice(0, 12)) {
    out.push({
      id: `eq:${q.time}:${q.lat.toFixed(2)}`,
      kind: "sismo",
      level: q.mag >= 6 ? "critico" : q.mag >= 5 ? "alto" : "moderado",
      title: `Sismo M ${q.mag.toFixed(1)}`,
      detail: `${q.place} · ${q.depthKm.toFixed(0)} km de profundidade`,
      lat: q.lat, lng: q.lng,
      when: q.time,
    });
  }

  for (const a of air.filter((s) => (s.value ?? 0) >= 35).slice(0, 10)) {
    const v = a.value ?? 0;
    out.push({
      id: `air:${a.lat.toFixed(2)}:${a.lng.toFixed(2)}`,
      kind: "ar",
      level: v >= 75 ? "critico" : v >= 55 ? "alto" : "moderado",
      title: `Ar insalubre · ${a.parameter.toUpperCase()} ${v.toFixed(0)} ${a.unit}`,
      detail: a.city || `${a.lat.toFixed(2)}, ${a.lng.toFixed(2)}`,
      lat: a.lat, lng: a.lng,
      when: a.updated || Date.now(),
    });
  }

  for (const f of floods.filter((f) => f.risk >= 32).slice(0, 12)) {
    out.push({
      id: f.id,
      kind: "enchente",
      level: f.risk >= 75 ? "critico" : f.risk >= 55 ? "alto" : "moderado",
      title: `Risco de alagamento ${f.risk}/100`,
      detail: `${FLOOD_LEVEL_LABEL[f.level]} · chuva 72 h ${f.rain72.toFixed(0)} mm${
        f.dischargeRatio != null ? ` · rio a ${(f.dischargeRatio * 100).toFixed(0)}% da média` : ""
      }`,
      lat: f.lat, lng: f.lng,
      when: f.updated,
    });
  }

  let list = out;
  if (focus) {
    const f = focus;
    list = out
      .map((a) => ({ ...a, km: distKm(f, a) }))
      // ciclones entram no raio ampliado — são fenômenos de grande escala
      .filter((a) => (a.km ?? 0) <= (a.kind === "ciclone" ? Math.max(f.radiusKm, 800) : f.radiusKm));
  }

  const order: Record<AlertLevel, number> = { critico: 0, alto: 1, moderado: 2 };
  list.sort(
    (x, y) =>
      order[x.level] - order[y.level] ||
      (focus ? (x.km ?? 0) - (y.km ?? 0) : 0) ||
      y.when - x.when,
  );
  return list;
}

export function countByLevel(list: EnvAlert[]) {
  return {
    critico: list.filter((a) => a.level === "critico").length,
    alto: list.filter((a) => a.level === "alto").length,
    moderado: list.filter((a) => a.level === "moderado").length,
  };
}

/** Opções de frequência de atualização compartilhadas pelos painéis. */
export const REFRESH_OPTIONS = [
  { ms: 30_000, label: "30s" },
  { ms: 60_000, label: "1min" },
  { ms: 120_000, label: "2min" },
  { ms: 300_000, label: "5min" },
] as const;
