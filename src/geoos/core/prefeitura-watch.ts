/**
 * Vigia a ÚNICA prefeitura monitorada e publica os eventos novos na Central
 * de Atividades (notificações). Roda apenas no cliente.
 */
import { useGeoOS } from "@/geoos/core/store";
import { bboxAround } from "@/geoos/core/watchpoints";
import { buildAlerts, LEVEL_STYLE, KIND_ICON, type EnvAlert } from "@/lib/gis/alerts";
import { getMonitored, type Prefeitura } from "@/lib/prefeituras";

const SEEN_KEY = "geoos.prefeituras.seen";
const POLL_MS = 5 * 60_000;

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-400)));
  } catch {
    /* noop */
  }
}

function levelOf(a: EnvAlert): "error" | "warn" | "info" {
  if (a.level === "critico") return "error";
  if (a.level === "alto") return "warn";
  return "info";
}

async function scan(p: Prefeitura, seen: Set<string>) {
  const box = bboxAround(p.lat, p.lng, p.radiusKm);
  const alerts = await buildAlerts(box, { lat: p.lat, lng: p.lng, radiusKm: p.radiusKm }).catch(
    () => [] as EnvAlert[],
  );
  const add = useGeoOS.getState().addNotification;
  for (const a of alerts.slice(0, 12)) {
    const key = `${p.slug}:${a.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    add({
      level: levelOf(a),
      title: `${KIND_ICON[a.kind]} ${a.title}`,
      message: `${LEVEL_STYLE[a.level].label} · ${a.detail}`,
      source: `Prefeitura de ${p.name}${p.uf ? ` · ${p.uf}` : ""}`,
      dedupeKey: key,
      pinned: true,
    });
  }
}

export function startPrefeituraAlertWatch() {
  if (typeof window === "undefined") return () => {};
  let stopped = false;

  const tick = async () => {
    const p = getMonitored();
    if (!p || stopped) return;
    const seen = loadSeen();
    await scan(p, seen);
    saveSeen(seen);
  };

  const first = window.setTimeout(() => void tick(), 8000);
  const timer = window.setInterval(() => void tick(), POLL_MS);
  const onSwitch = () => void tick();
  window.addEventListener("geoos:prefeitura-monitorada", onSwitch);
  return () => {
    stopped = true;
    window.clearTimeout(first);
    window.clearInterval(timer);
    window.removeEventListener("geoos:prefeitura-monitorada", onSwitch);
  };
}
