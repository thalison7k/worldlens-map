import { swr } from "../cache";
import { bus } from "@/geoos/core/bus";

export type EnsoPhase =
  | "strong-nino" | "nino" | "neutral" | "nina" | "strong-nina" | "unknown";

export type EnsoData = {
  latest: { year: number; month: number; anom: number } | null;
  phase: EnsoPhase;
  history: { year: number; month: number; anom: number }[];
};

export async function fetchEnso(): Promise<EnsoData> {
  const started = performance.now();
  try {
    const data = await swr("enso:oni", 60 * 60_000, async () => {
      const r = await fetch("/api/public/enso");
      if (!r.ok) throw new Error(`ENSO ${r.status}`);
      return (await r.json()) as EnsoData;
    });
    bus.emit("api.status", { id: "enso", label: "NOAA ENSO", ok: true, latencyMs: Math.round(performance.now() - started), ts: Date.now(), count: data.history?.length ?? 0 });
    return data;
  } catch (err) {
    bus.emit("api.status", { id: "enso", label: "NOAA ENSO", ok: false, latencyMs: Math.round(performance.now() - started), ts: Date.now(), error: String(err) });
    return { latest: null, phase: "unknown", history: [] };
  }
}

export function ensoLabel(phase: EnsoPhase): string {
  switch (phase) {
    case "strong-nino": return "El Niño forte";
    case "nino": return "El Niño";
    case "neutral": return "Neutro";
    case "nina": return "La Niña";
    case "strong-nina": return "La Niña forte";
    default: return "Sem dados";
  }
}

export function ensoColor(phase: EnsoPhase): string {
  switch (phase) {
    case "strong-nino": return "#b91c1c";
    case "nino": return "#ea580c";
    case "neutral": return "#64748b";
    case "nina": return "#0284c7";
    case "strong-nina": return "#1e40af";
    default: return "#475569";
  }
}
