import { bus } from "./bus";

/**
 * Locais monitorados (watchpoints) compartilhados entre a Central Ambiental
 * (Dashboard) e a Central de Alertas. Uma única fonte de verdade, persistida
 * em localStorage e sincronizada por evento no bus — assim escolher
 * "Mogi das Cruzes" no dashboard passa a valer também para os alertas,
 * permitindo o cruzamento dos dados por localidade.
 */
export type Watchpoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
};

const STORE_KEY = "geoos.alerts.watchpoints";
const ACTIVE_KEY = "geoos.alerts.activeWatch";

export function loadWatchpoints(): Watchpoint[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Watchpoint[];
    return Array.isArray(arr) ? arr.filter((w) => typeof w?.lat === "number") : [];
  } catch {
    return [];
  }
}

export function saveWatchpoints(list: Watchpoint[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
  bus.emit("watch.change", { id: loadActiveId(), list });
}

export function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveWatch(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* noop */
  }
  bus.emit("watch.change", { id, list: loadWatchpoints() });
}

/** BBox que circunscreve o raio de vigilância do local monitorado. */
export function bboxAround(
  lat: number,
  lng: number,
  km: number,
): [number, number, number, number] {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}
