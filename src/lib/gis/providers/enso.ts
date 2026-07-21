import { swr } from "../cache";

export type EnsoPhase =
  | "strong-nino" | "nino" | "neutral" | "nina" | "strong-nina" | "unknown";

export type EnsoData = {
  latest: { year: number; month: number; anom: number } | null;
  phase: EnsoPhase;
  history: { year: number; month: number; anom: number }[];
};

export async function fetchEnso(): Promise<EnsoData> {
  return swr("enso:oni", 60 * 60_000, async () => {
    const r = await fetch("/api/public/enso");
    if (!r.ok) throw new Error(`ENSO ${r.status}`);
    return (await r.json()) as EnsoData;
  });
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
