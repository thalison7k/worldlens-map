/**
 * Registro de prefeituras monitoradas. Cada prefeitura tem um painel próprio
 * em /prefeituras/{slug}, alimentado pelos mesmos provedores ambientais reais
 * usados no GeoOS. Persistido em localStorage.
 */
export type Prefeitura = {
  slug: string;
  name: string;
  uf?: string;
  lat: number;
  lng: number;
  radiusKm: number;
};

const KEY = "geoos.prefeituras";

export const DEFAULT_PREFEITURAS: Prefeitura[] = [
  { slug: "mogi-das-cruzes-sp", name: "Mogi das Cruzes", uf: "SP", lat: -23.5228, lng: -46.1883, radiusKm: 40 },
  { slug: "sao-paulo-sp", name: "São Paulo", uf: "SP", lat: -23.5505, lng: -46.6333, radiusKm: 60 },
  { slug: "manaus-am", name: "Manaus", uf: "AM", lat: -3.119, lng: -60.0217, radiusKm: 80 },
  { slug: "recife-pe", name: "Recife", uf: "PE", lat: -8.0476, lng: -34.877, radiusKm: 50 },
];

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
