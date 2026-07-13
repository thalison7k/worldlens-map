/**
 * Theme Engine — single source of truth for GeoOS visual identity.
 *
 * Fully decoupled: subscribes to `theme.change` on the bus and broadcasts
 * `map.setBase` + writes CSS variables at :root. Apps and the MapKernel
 * never import this file directly; they only listen to the bus.
 */
import { bus } from "./bus";

export type ThemeMode = "dark" | "light";
export type ThemeVariantId =
  | "midnight"
  | "arctic"
  | "forest"
  | "sunset"
  | "cyber"
  | "paper";

export interface ThemeVariant {
  id: ThemeVariantId;
  label: string;
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
    label: "Midnight",
    mode: "dark",
    mapBase: "dark",
    tokens: {
      bg: "oklch(0.13 0.02 250)",
      surface: "oklch(0.18 0.025 250)",
      window: "oklch(0.18 0.025 250 / 0.85)",
      accent: "oklch(0.78 0.17 195)",
      accent2: "oklch(0.72 0.20 280)",
      text: "oklch(0.98 0.005 250)",
    },
  },
  {
    id: "cyber",
    label: "Cyber",
    mode: "dark",
    mapBase: "dark",
    tokens: {
      bg: "oklch(0.11 0.03 300)",
      surface: "oklch(0.17 0.04 300)",
      window: "oklch(0.17 0.04 300 / 0.85)",
      accent: "oklch(0.82 0.20 320)",
      accent2: "oklch(0.78 0.18 180)",
      text: "oklch(0.98 0.005 250)",
    },
  },
  {
    id: "forest",
    label: "Forest",
    mode: "dark",
    mapBase: "terrain",
    tokens: {
      bg: "oklch(0.15 0.03 155)",
      surface: "oklch(0.20 0.03 155)",
      window: "oklch(0.20 0.03 155 / 0.85)",
      accent: "oklch(0.75 0.18 150)",
      accent2: "oklch(0.72 0.18 90)",
      text: "oklch(0.97 0.01 150)",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    mode: "dark",
    mapBase: "satellite",
    tokens: {
      bg: "oklch(0.14 0.03 30)",
      surface: "oklch(0.20 0.04 30)",
      window: "oklch(0.20 0.04 30 / 0.85)",
      accent: "oklch(0.78 0.19 55)",
      accent2: "oklch(0.70 0.22 25)",
      text: "oklch(0.98 0.01 60)",
    },
  },
  {
    id: "arctic",
    label: "Arctic",
    mode: "light",
    mapBase: "light",
    tokens: {
      bg: "oklch(0.97 0.01 220)",
      surface: "oklch(0.99 0.005 220 / 0.85)",
      window: "oklch(1 0 0 / 0.85)",
      accent: "oklch(0.60 0.15 220)",
      accent2: "oklch(0.55 0.18 265)",
      text: "oklch(0.20 0.03 250)",
    },
  },
  {
    id: "paper",
    label: "Paper",
    mode: "light",
    mapBase: "street",
    tokens: {
      bg: "oklch(0.96 0.01 80)",
      surface: "oklch(0.99 0.005 80 / 0.85)",
      window: "oklch(1 0 0 / 0.9)",
      accent: "oklch(0.55 0.17 30)",
      accent2: "oklch(0.50 0.15 145)",
      text: "oklch(0.22 0.02 60)",
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

  bus.on("theme.change", ({ theme, variant }: { theme: ThemeMode; variant?: ThemeVariantId }) => {
    // If a variant was requested, honor it; otherwise pick the default for that mode
    // — but only if the current variant does not already match the requested mode.
    if (variant && THEME_BY_ID[variant]) {
      applyVariant(variant);
      return;
    }
    const current = THEME_BY_ID[currentVariant];
    if (!current || current.mode !== theme) {
      applyVariant(DEFAULT_VARIANT_FOR[theme]);
    }
  });
}
