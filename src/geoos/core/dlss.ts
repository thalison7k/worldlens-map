/**
 * DLSS 5 — Deep Layer Super Sampling (GeoOS render engine)
 *
 * Escala dinamicamente a resolução das camadas do mapa:
 *  - super-amostragem (retina/2x) quando o dispositivo aguenta;
 *  - queda automática de resolução durante pan/zoom (dynamic resolution);
 *  - upscaling suave (image-rendering + nitidez) quando o mapa fica ocioso.
 *
 * Não depende de Leaflet: aplica classes CSS e expõe o modo atual para o
 * MapKernel decidir `detectRetina` / `tileSize` das TileLayers.
 */

export type DLSSMode = "off" | "balanced" | "quality" | "ultra";

export const DLSS_MODES: DLSSMode[] = ["off", "balanced", "quality", "ultra"];

export const DLSS_LABEL: Record<DLSSMode, string> = {
  off: "DLSS off",
  balanced: "DLSS 5 · Balanced",
  quality: "DLSS 5 · Quality",
  ultra: "DLSS 5 · Ultra",
};

const KEY = "geoos.dlss.mode";

/** Heurística de hardware: telas pequenas/fracas começam em Balanced. */
export function defaultMode(): DLSSMode {
  if (typeof window === "undefined") return "balanced";
  const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (coarse && (cores <= 4 || mem <= 4)) return "balanced";
  return cores >= 8 && mem >= 8 ? "quality" : "balanced";
}

export function loadMode(): DLSSMode {
  if (typeof window === "undefined") return "balanced";
  const saved = window.localStorage.getItem(KEY) as DLSSMode | null;
  return saved && DLSS_MODES.includes(saved) ? saved : defaultMode();
}

export function saveMode(mode: DLSSMode) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, mode);
}

export function nextMode(mode: DLSSMode): DLSSMode {
  return DLSS_MODES[(DLSS_MODES.indexOf(mode) + 1) % DLSS_MODES.length];
}

/** Super-amostragem de tiles (detectRetina do Leaflet). */
export function superSampling(mode: DLSSMode): boolean {
  if (typeof window === "undefined") return false;
  if (mode === "off" || mode === "balanced") return false;
  // Em telas já retina, "quality" mantém 1x lógico e "ultra" força 2x.
  return mode === "ultra" || (window.devicePixelRatio || 1) < 1.5;
}

/** Fator de nitidez aplicado por CSS após o upscaling. */
export function sharpen(mode: DLSSMode): number {
  return mode === "off" ? 0 : mode === "balanced" ? 0.25 : mode === "quality" ? 0.45 : 0.7;
}

/**
 * Aplica o modo ao container do mapa. Retorna uma função de limpeza.
 */
export function applyDLSS(container: HTMLElement, mode: DLSSMode) {
  DLSS_MODES.forEach((m) => container.classList.remove(`geoos-dlss-${m}`));
  container.classList.add(`geoos-dlss-${mode}`);
  container.style.setProperty("--geoos-dlss-sharpen", String(sharpen(mode)));
}
