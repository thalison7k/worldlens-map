import { swr } from "../cache";
import { bus } from "@/geoos/core/bus";

export type TornadoWarning = {
  id: string;
  title: string;
  severity: string;
  certainty: string;
  urgency: string;
  area: string;
  description: string;
  instruction: string | null;
  lat: number;
  lng: number;
  polygon: [number, number][];
  onset: string | null;
  expires: string | null;
  source: string;
};

/** Avisos oficiais ativos de tornado, publicados pelo NOAA/NWS. */
export async function fetchTornadoWarnings(): Promise<TornadoWarning[]> {
  const started = performance.now();
  try {
    const data = await swr("tornadoes:active", 60_000, async () => {
      const response = await fetch("/api/public/tornadoes");
      if (!response.ok) throw new Error(`Tornadoes ${response.status}`);
      return (await response.json()) as { warnings: TornadoWarning[] };
    });
    const warnings = data.warnings ?? [];
    bus.emit("api.status", {
      id: "tornadoes",
      label: "NOAA/NWS Tornado Warnings",
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      ts: Date.now(),
      count: warnings.length,
    });
    return warnings;
  } catch (error) {
    bus.emit("api.status", {
      id: "tornadoes",
      label: "NOAA/NWS Tornado Warnings",
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      ts: Date.now(),
      error: String(error),
    });
    return [];
  }
}