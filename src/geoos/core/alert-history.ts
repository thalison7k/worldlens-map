/**
 * Histórico permanente de alertas por município. Independente das
 * notificações (limpar notificações não apaga o histórico).
 */
export type AlertHistoryEntry = {
  key: string;
  municipality: string;
  kind: string;
  level: "critico" | "alto" | "moderado";
  title: string;
  detail: string;
  /** quando o evento ocorreu na fonte */
  eventTs: number;
  /** quando o sistema detectou */
  detectedTs: number;
};

const KEY = "geoos.alerts.history";
const MAX = 2000;
export const HISTORY_EVENT = "geoos:alert-history";

export function loadHistory(): AlertHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as AlertHistoryEntry[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(list: AlertHistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* noop */
  }
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

export function recordHistory(entries: AlertHistoryEntry[]) {
  if (!entries.length) return;
  const list = loadHistory();
  const seen = new Set(list.map((e) => e.key));
  const fresh = entries.filter((e) => !seen.has(e.key));
  if (fresh.length) save([...list, ...fresh]);
}

export function clearHistory(municipality?: string) {
  save(municipality ? loadHistory().filter((e) => e.municipality !== municipality) : []);
}
