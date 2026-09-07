/**
 * Registro de prefeituras monitoradas. Cada prefeitura tem um painel próprio
 * em /prefeituras/{slug}, alimentado pelos mesmos provedores ambientais reais
 * usados no GeoOS. Persistido em localStorage.
 *
 * Regra do sistema: apenas UMA prefeitura fica monitorada por vez, evitando
 * conflito de dados e duplicidade de notificações.
 */
export type Prefeitura = {
  slug: string;
  name: string;
  uf?: string;
  lat: number;
  lng: number;
  radiusKm: number;
  /** Quando falso, os alertas deste município não geram notificações. */
  alertsEnabled?: boolean;
};

const KEY = "geoos.prefeituras";
const MONITORED_KEY = "geoos.prefeitura.monitorada";

export const DEFAULT_PREFEITURAS: Prefeitura[] = [
  { slug: "mogi-das-cruzes-sp", name: "Mogi das Cruzes", uf: "SP", lat: -23.5228, lng: -46.1883, radiusKm: 40 },
  { slug: "sao-paulo-sp", name: "São Paulo", uf: "SP", lat: -23.5505, lng: -46.6333, radiusKm: 60 },
  { slug: "manaus-am", name: "Manaus", uf: "AM", lat: -3.119, lng: -60.0217, radiusKm: 80 },
  { slug: "recife-pe", name: "Recife", uf: "PE", lat: -8.0476, lng: -34.877, radiusKm: 50 },
];

/** Fontes públicas reais que abastecem cada painel municipal. */
export const FONTES_REAIS = [
  { id: "firms", label: "NASA FIRMS / INPE", detail: "Focos de calor e queimadas (VIIRS/MODIS)" },
  { id: "usgs", label: "USGS Earthquakes", detail: "Sismos das últimas 24 h" },
  { id: "openaq", label: "OpenAQ", detail: "Estações reais de qualidade do ar" },
  { id: "openmeteo", label: "Open-Meteo", detail: "Previsão horária e de 7 dias" },
  { id: "glofas", label: "Copernicus GloFAS", detail: "Chuva acumulada e risco de alagamento" },
  { id: "nhc", label: "NOAA NHC", detail: "Ciclones e furacões ativos" },
] as const;

export function slugify(name: string, uf?: string) {
  const base = `${name} ${uf ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `local-${Date.now()}`;
}

export function loadPrefeituras(): Prefeitura[] {
  if (typeof localStorage === "undefined") return DEFAULT_PREFEITURAS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFEITURAS;
    const arr = JSON.parse(raw) as Prefeitura[];
    return Array.isArray(arr) && arr.length ? arr : DEFAULT_PREFEITURAS;
  } catch {
    return DEFAULT_PREFEITURAS;
  }
}

export function savePrefeituras(list: Prefeitura[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

export function getPrefeitura(slug: string): Prefeitura | null {
  return loadPrefeituras().find((p) => p.slug === slug) ?? null;
}

/** Slug da única prefeitura monitorada no momento. */
export function getMonitoredSlug(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const stored = localStorage.getItem(MONITORED_KEY);
    const list = loadPrefeituras();
    if (stored && list.some((p) => p.slug === stored)) return stored;
    const legacy = list.find((p) => p.alertsEnabled)?.slug ?? null;
    if (legacy) localStorage.setItem(MONITORED_KEY, legacy);
    return legacy;
  } catch {
    return null;
  }
}

export function getMonitored(): Prefeitura | null {
  const slug = getMonitoredSlug();
  return slug ? getPrefeitura(slug) : null;
}

/**
 * Define (ou limpa) a prefeitura monitorada. Exclusivo: ativar uma desativa
 * automaticamente todas as outras.
 */
export function setMonitored(slug: string | null): Prefeitura[] {
  try {
    if (slug) localStorage.setItem(MONITORED_KEY, slug);
    else localStorage.removeItem(MONITORED_KEY);
  } catch {
    /* noop */
  }
  const next = loadPrefeituras().map((p) => ({ ...p, alertsEnabled: p.slug === slug }));
  savePrefeituras(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("geoos:prefeitura-monitorada", { detail: slug }));
  }
  return next;
}

/** Liga/desliga o monitoramento de um município (exclusivo). */
export function setAlertsEnabled(slug: string, enabled: boolean): Prefeitura[] {
  return setMonitored(enabled ? slug : null);
}
