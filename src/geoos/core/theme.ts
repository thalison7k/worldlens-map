/**
 * Theme Engine — single source of truth for GeoOS visual identity.
 *
 * Fully decoupled: subscribes to `theme.change` on the bus and broadcasts
 * `map.setBase` + writes CSS variables at :root. Apps and the MapKernel
 * never import this file directly; they only listen to the bus.
 */
import { bus } from "./bus";
import { useGeoOS } from "./store";

export type ThemeMode = "dark" | "light";
/** GamaTec design system — exatamente 3 variantes oficiais. */
export type ThemeVariantId = "midnight" | "cyber" | "arctic";

export interface ThemeVariant {
  id: ThemeVariantId;
  label: string;
  /** curta descrição usada no seletor */
  hint: string;
  mode: ThemeMode;
  /** which BaseView the MapKernel should render */
  mapBase: "dark" | "light" | "satellite" | "terrain" | "street" | "hybrid";
  tokens: {
    bg: string;
    surface: string;
    window: string;
    accent: string;
    accent2: string;
    text: string;
  };
}

export const THEME_VARIANTS: ThemeVariant[] = [
  {
    id: "midnight",
    label: "GamaTec Core",
    hint: "Grafite profundo · ciano técnico",
    mode: "dark",
    mapBase: "dark",
    tokens: {
      bg: "oklch(0.145 0.015 245)",
      surface: "oklch(0.205 0.018 245)",
      window: "oklch(0.205 0.018 245 / 0.82)",
      accent: "oklch(0.80 0.15 195)",
      accent2: "oklch(0.74 0.16 255)",
      text: "oklch(0.98 0.004 245)",
    },
  },
  {
    id: "cyber",
    label: "GamaTec Pulse",
    hint: "Preto tinta · lima neon",
    mode: "dark",
    mapBase: "satellite",
    tokens: {
      bg: "oklch(0.115 0.012 260)",
      surface: "oklch(0.175 0.016 260)",
      window: "oklch(0.175 0.016 260 / 0.82)",
      accent: "oklch(0.87 0.20 135)",
      accent2: "oklch(0.80 0.17 195)",
      text: "oklch(0.98 0.004 260)",
    },
  },
  {
    id: "arctic",
    label: "GamaTec Clear",
    hint: "Branco técnico · azul preciso",
    mode: "light",
    mapBase: "light",
    tokens: {
      bg: "oklch(0.975 0.005 240)",
      surface: "oklch(0.995 0.003 240 / 0.88)",
      window: "oklch(1 0 0 / 0.88)",
      accent: "oklch(0.58 0.14 235)",
      accent2: "oklch(0.62 0.12 195)",
      text: "oklch(0.22 0.02 245)",
    },
  },
];

export const THEME_BY_ID: Record<ThemeVariantId, ThemeVariant> = Object.fromEntries(
  THEME_VARIANTS.map((v) => [v.id, v]),
) as Record<ThemeVariantId, ThemeVariant>;

export const DEFAULT_VARIANT_FOR: Record<ThemeMode, ThemeVariantId> = {
  dark: "midnight",
  light: "arctic",
};


let started = false;
let currentVariant: ThemeVariantId = "midnight";

function applyTokens(v: ThemeVariant) {
  const root = document.documentElement;
  root.classList.toggle("dark", v.mode === "dark");
  root.style.setProperty("--geoos-bg", v.tokens.bg);
  root.style.setProperty("--geoos-surface", v.tokens.surface);
  root.style.setProperty("--geoos-window", v.tokens.window);
  root.style.setProperty("--geoos-accent", v.tokens.accent);
  root.style.setProperty("--geoos-accent-2", v.tokens.accent2);
  root.style.setProperty("--geoos-text", v.tokens.text);
  root.style.colorScheme = v.mode;
  root.dataset.themeVariant = v.id;
  // theme-color for PWA / mobile chrome
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = v.mode === "dark" ? "#0a0f1a" : "#f5f7fb";
}

export function applyVariant(id: ThemeVariantId) {
  const v = THEME_BY_ID[id];
  if (!v) return;
  currentVariant = id;
  applyTokens(v);
  // mantém o store em sincronia — o botão Light/Dark e os apps leem daqui
  if (useGeoOS.getState().theme !== v.mode) useGeoOS.setState({ theme: v.mode });
  bus.emit("map.setBase", { base: v.mapBase });
  try {
    localStorage.setItem("geoos.theme.variant", id);
  } catch {
    /* ignore */
  }
}

export function getCurrentVariant(): ThemeVariantId {
  return currentVariant;
}

/**
 * Initializes the Theme Engine. Idempotent. Wires the bus once, per app-lifetime.
 * Apps only emit `theme.change` — nobody imports this file to mutate state.
 */
export function startThemeEngine() {
  if (started || typeof window === "undefined") return;
  started = true;

  const saved = (() => {
    try {
      return localStorage.getItem("geoos.theme.variant") as ThemeVariantId | null;
    } catch {
      return null;
    }
  })();
  if (saved && THEME_BY_ID[saved]) applyVariant(saved);

  bus.on("theme.change", (payload) => {
    const { theme, variant } = payload as { theme: ThemeMode; variant?: string };
    if (variant && THEME_BY_ID[variant as ThemeVariantId]) {
      applyVariant(variant as ThemeVariantId);
      return;
    }
    const current = THEME_BY_ID[currentVariant];
    if (!current || current.mode !== theme) {
      applyVariant(DEFAULT_VARIANT_FOR[theme]);
    }
  });
}
