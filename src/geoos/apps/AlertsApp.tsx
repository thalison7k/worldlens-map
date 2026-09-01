import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Bell, BellOff, Crosshair, History, MapPin, Plus, RefreshCw, Search, Star, Trash2,
  Volume2, VolumeX, Wind, X,
} from "lucide-react";
import { bus } from "@/geoos/core/bus";
import { useBus } from "@/geoos/core/useBus";
import { getMapSnapshot } from "@/geoos/core/map-state";
import { isMuted, playAlertSound, setMuted, unlockAudio } from "@/geoos/core/audio";
import { fetchFires } from "@/lib/gis/providers/firms";
import { fetchEarthquakes } from "@/lib/gis/providers/usgs";
import { fetchAirStations } from "@/lib/gis/providers/openaq";
import { fetchCyclones, cycloneCategory, bearingLabel } from "@/lib/gis/providers/cyclones";
import { fetchFloodRisk, FLOOD_LEVEL_LABEL } from "@/lib/gis/providers/floods";
import { searchAddress, reverseGeocode, parseCoordinates } from "@/lib/gis/geocoding";
import type { BBox } from "@/lib/gis/simulated";


type Level = "critico" | "alto" | "moderado";

type Alert = {
  id: string;
  kind: "ciclone" | "queimada" | "sismo" | "ar" | "enchente";
  level: Level;
  title: string;
  detail: string;
  lat: number;
  lng: number;
  when: number;
  km?: number;
};

/** Local monitorado com foco: município, bairro ou ponto qualquer + raio de vigilância. */
type Watchpoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
};

const LEVEL_STYLE: Record<Level, { color: string; label: string }> = {
  critico: { color: "#dc2626", label: "Crítico" },
  alto: { color: "#f97316", label: "Alto" },
  moderado: { color: "#eab308", label: "Moderado" },
};

const KIND_ICON: Record<Alert["kind"], string> = {
  ciclone: "🌀", queimada: "🔥", sismo: "🌐", ar: "🌫️", enchente: "🌊",
};

const REFRESH_MS = 180_000;
const STORE_KEY = "geoos.alerts.watchpoints";
const ACTIVE_KEY = "geoos.alerts.activeWatch";
const RADIUS_OPTIONS = [10, 25, 50, 100, 200];

function inside(b: BBox, lat: number, lng: number) {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** BBox que circunscreve o raio de vigilância do local monitorado. */
function bboxAround(lat: number, lng: number, km: number): BBox {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

function loadWatchpoints(): Watchpoint[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Watchpoint[];
    return Array.isArray(arr) ? arr.filter((w) => typeof w?.lat === "number") : [];
  } catch {
    return [];
  }
}

/**
 * AlertsApp — central de alertas ambientais com foco local.
 *
 * Dois modos de vigilância: "Área visível" (varre o que está na tela) e
 * "Local monitorado" (município/ponto fixo com raio, ex.: Mogi das Cruzes 25 km),
 * pensado para prefeituras e órgãos públicos acompanharem um território fixo
 * independentemente de onde o mapa esteja navegando.
 */
export default function AlertsApp() {
  const [bbox, setBbox] = useState<BBox>(() => getMapSnapshot().bbox);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notify, setNotify] = useState(true);
  const [sound, setSound] = useState(() => !isMuted());

  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [watchpoints, setWatchpoints] = useState<Watchpoint[]>(() => loadWatchpoints());
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  });
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const seenRef = useRef(seen);
  seenRef.current = seen;

  useBus("map.bbox", (b) => setBbox([b.west, b.south, b.east, b.north]));

  const active = watchpoints.find((w) => w.id === activeId) ?? null;

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(watchpoints)); } catch { /* noop */ }
  }, [watchpoints]);
  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch { /* noop */ }
  }, [activeId]);

  const load = useCallback(async (box: BBox, focus: Watchpoint | null) => {
    setLoading(true);
    const [cyclones, fires, quakes, air, floods] = await Promise.all([
      fetchCyclones().catch(() => []),
      fetchFires(box, 1).catch(() => []),
      fetchEarthquakes("day").catch(() => []),
      fetchAirStations(box, 120).catch(() => []),
      fetchFloodRisk(box, 4).catch(() => []),
    ]);

    const out: Alert[] = [];

    for (const s of cyclones) {
      const { label, cat } = cycloneCategory(s.intensityKt);
      out.push({
        id: `cyc:${s.id}`,
        kind: "ciclone",
        level: cat >= 3 ? "critico" : cat >= 1 ? "alto" : "moderado",
        title: `${s.name} · ${label}`,
        detail: `${s.intensityKt ?? "?"} kt · ${s.pressureMb ?? "?"} hPa · rumo ${bearingLabel(s.movementDir)}`,
        lat: s.lat, lng: s.lng,
        when: s.lastUpdate ? new Date(s.lastUpdate).getTime() : Date.now(),
      });
    }

    for (const f of fires.filter((f) => f.frp >= 40).slice(0, 12)) {
      out.push({
        id: `fire:${f.lat.toFixed(3)}:${f.lng.toFixed(3)}`,
        kind: "queimada",
        level: f.frp >= 120 ? "critico" : "alto",
        title: `Foco de calor · FRP ${f.frp.toFixed(0)} MW`,
        detail: `Confiança ${f.confidence ?? "n/d"} · ${f.lat.toFixed(2)}, ${f.lng.toFixed(2)}`,
        lat: f.lat, lng: f.lng,
        when: Date.now(),
      });
    }

    for (const q of quakes.filter((q) => q.mag >= 4 && inside(box, q.lat, q.lng)).slice(0, 12)) {
      out.push({
        id: `eq:${q.time}:${q.lat.toFixed(2)}`,
        kind: "sismo",
        level: q.mag >= 6 ? "critico" : q.mag >= 5 ? "alto" : "moderado",
        title: `Sismo M ${q.mag.toFixed(1)}`,
        detail: `${q.place} · ${q.depthKm.toFixed(0)} km de profundidade`,
        lat: q.lat, lng: q.lng,
        when: q.time,
      });
    }

    for (const a of air.filter((s) => (s.value ?? 0) >= 35).slice(0, 10)) {
      const v = a.value ?? 0;
      out.push({
        id: `air:${a.lat.toFixed(2)}:${a.lng.toFixed(2)}`,
        kind: "ar",
        level: v >= 75 ? "critico" : v >= 55 ? "alto" : "moderado",
        title: `Ar insalubre · ${a.parameter.toUpperCase()} ${v.toFixed(0)} ${a.unit}`,
        detail: a.city || `${a.lat.toFixed(2)}, ${a.lng.toFixed(2)}`,
        lat: a.lat, lng: a.lng,
        when: a.updated || Date.now(),
      });
    }

    for (const f of floods.filter((f) => f.risk >= 32).slice(0, 12)) {
      out.push({
        id: f.id,
        kind: "enchente",
        level: f.risk >= 75 ? "critico" : f.risk >= 55 ? "alto" : "moderado",
        title: `Risco de alagamento ${f.risk}/100`,
        detail: `${FLOOD_LEVEL_LABEL[f.level]} · chuva 72 h ${f.rain72.toFixed(0)} mm${
          f.dischargeRatio != null ? ` · rio a ${(f.dischargeRatio * 100).toFixed(0)}% da média` : ""
        }`,
        lat: f.lat, lng: f.lng,
        when: f.updated,
      });
    }

    let list = out;
    if (focus) {
      list = out
        .map((a) => ({ ...a, km: distKm(focus, a) }))
        // ciclones entram no raio ampliado — são fenômenos de grande escala
        .filter((a) => (a.km ?? 0) <= (a.kind === "ciclone" ? Math.max(focus.radiusKm, 800) : focus.radiusKm));
    }

    const order: Record<Level, number> = { critico: 0, alto: 1, moderado: 2 };
    list.sort(
      (x, y) =>
        order[x.level] - order[y.level] ||
        (focus ? (x.km ?? 0) - (y.km ?? 0) : 0) ||
        y.when - x.when,
    );
    setAlerts(list);
    setUpdatedAt(Date.now());
    setLoading(false);
    return list;
  }, []);

  const scanBox: BBox = active ? bboxAround(active.lat, active.lng, active.radiusKm) : bbox;
  const scanKey = active
    ? `w:${active.id}:${active.radiusKm}`
    : `v:${bbox.map((v) => Math.round(v)).join(",")}`;

  useEffect(() => {
    let alive = true;
    const run = () => {
      void load(scanBox, active).then((out) => {
        if (!alive || !notify) return;
        const fresh = out.filter((a) => a.level === "critico" && !seenRef.current.has(a.id));
        if (fresh.length) {
          setSeen((s) => new Set([...s, ...fresh.map((a) => a.id)]));
          bus.emit("notify", {
            title: `${fresh.length} alerta(s) crítico(s)${active ? ` · ${active.name}` : ""}`,
            message: fresh.slice(0, 3).map((a) => a.title).join(" · "),
            level: "error",
          });
        }
      });
    };
    run();
    const iv = setInterval(() => { if (!document.hidden) run(); }, REFRESH_MS);
    return () => { alive = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey, notify]);

  const counts = useMemo(() => ({
    critico: alerts.filter((a) => a.level === "critico").length,
    alto: alerts.filter((a) => a.level === "alto").length,
    moderado: alerts.filter((a) => a.level === "moderado").length,
  }), [alerts]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const coords = parseCoordinates(q);
      if (coords) {
        const rev = await reverseGeocode(coords.lat, coords.lng).catch(() => null);
        setResults([{ name: rev?.displayName ?? `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`, ...coords }]);
      } else {
        const hits = await searchAddress(q);
        setResults(hits.slice(0, 6).map((h) => ({ name: h.displayName, lat: h.lat, lng: h.lng })));
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const addWatch = (name: string, lat: number, lng: number) => {
    const short = name.split(",").slice(0, 2).join(",").trim();
    const wp: Watchpoint = { id: `wp:${Date.now()}`, name: short || name, lat, lng, radiusKm: 25 };
    setWatchpoints((w) => [...w, wp]);
    setActiveId(wp.id);
    setAdding(false);
    setQuery("");
    setResults([]);
    bus.emit("map.flyTo", { lat, lng, zoom: 10 });
  };

  const addCurrentCenter = async () => {
    const snap = getMapSnapshot();
    const c = { lat: snap.center?.lat ?? (snap.bbox[1] + snap.bbox[3]) / 2, lng: snap.center?.lng ?? (snap.bbox[0] + snap.bbox[2]) / 2 };
    const rev = await reverseGeocode(c.lat, c.lng).catch(() => null);
    const a = rev?.address;
    const name = a?.city || a?.town || a?.village || rev?.displayName || `${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`;
    addWatch(name, c.lat, c.lng);
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2 text-white/85">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] uppercase tracking-widest text-white/45">Central de alertas</div>
          <div className="truncate font-mono text-[11px] text-white/55">
            {updatedAt ? `atualizado ${new Date(updatedAt).toLocaleTimeString("pt-BR")}` : "carregando…"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => { unlockAudio(); const next = !sound; setSound(next); setMuted(!next); if (next) playAlertSound("ok"); }}
            title={sound ? "Silenciar som dos alertas" : "Ativar som dos alertas"}
            aria-label={sound ? "Silenciar som dos alertas" : "Ativar som dos alertas"}
            className={`grid h-8 w-8 place-items-center rounded-full border transition-all active:scale-90 ${
              sound ? "border-emerald-400/60 bg-emerald-400/15 text-white" : "border-white/10 text-white/50"
            }`}
          >
            {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setNotify((n) => !n)}
            title={notify ? "Silenciar notificações" : "Ativar notificações"}
            className={`grid h-8 w-8 place-items-center rounded-full border transition-all active:scale-90 ${
              notify ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/15 text-white" : "border-white/10 text-white/50"
            }`}
          >
            {notify ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => void load(scanBox, active)}
            title="Atualizar agora"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition-all hover:bg-white/10 active:scale-90"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ---- Foco de monitoramento ------------------------------------------ */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Foco de monitoramento</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void addCurrentCenter()}
              title="Monitorar o local no centro do mapa"
              className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-white/60 transition-all hover:bg-white/10 active:scale-90"
            >
              <Crosshair className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              title="Adicionar local monitorado"
              className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-white/60 transition-all hover:bg-white/10 active:scale-90"
            >
              {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-all active:scale-95 ${
              !active
                ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/15 text-white"
                : "border-white/10 text-white/55 hover:bg-white/10"
            }`}
          >
            Área visível
          </button>
          {watchpoints.map((w) => (
            <span
              key={w.id}
              className={`group flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-all ${
                active?.id === w.id
                  ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/15 text-white"
                  : "border-white/10 text-white/55 hover:bg-white/10"
              }`}
            >
              <button
                type="button"
                onClick={() => { setActiveId(w.id); bus.emit("map.flyTo", { lat: w.lat, lng: w.lng, zoom: 10 }); }}
                className="flex max-w-[150px] items-center gap-1 active:scale-95"
                title={`Monitorar ${w.name} (raio ${w.radiusKm} km)`}
              >
                {active?.id === w.id ? <Star className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
                <span className="truncate">{w.name}</span>
              </button>
              <button
                type="button"
                title="Remover local"
                onClick={() => {
                  setWatchpoints((list) => list.filter((x) => x.id !== w.id));
                  if (activeId === w.id) setActiveId(null);
                }}
                className="text-white/35 transition-colors hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>

        {adding && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
                placeholder="Município, endereço, CEP ou lat, lng"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white/85 outline-none placeholder:text-white/30 focus:border-[color:var(--geoos-accent)]/60"
              />
              <button
                type="button"
                onClick={() => void runSearch()}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 text-white/70 transition-all hover:bg-white/10 active:scale-90"
              >
                <Search className={`h-3.5 w-3.5 ${searching ? "animate-pulse" : ""}`} />
              </button>
            </div>
            {results.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-1">
                {results.map((r, i) => (
                  <button
                    key={`${r.lat}:${r.lng}:${i}`}
                    type="button"
                    onClick={() => addWatch(r.name, r.lat, r.lng)}
                    className="truncate rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-[11px] text-white/70 transition-all hover:bg-white/10 active:scale-[0.99]"
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {active && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/40">Raio</span>
            {RADIUS_OPTIONS.map((km) => (
              <button
                key={km}
                type="button"
                onClick={() =>
                  setWatchpoints((list) => list.map((w) => (w.id === active.id ? { ...w, radiusKm: km } : w)))
                }
                className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition-all active:scale-95 ${
                  active.radiusKm === km
                    ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/15 text-white"
                    : "border-white/10 text-white/50 hover:bg-white/10"
                }`}
              >
                {km}km
              </button>
            ))}
          </div>
        )}

        <div className="mt-1.5 text-[10px] leading-relaxed text-white/40">
          {active
            ? `Vigilância contínua de ${active.name} num raio de ${active.radiusKm} km — os alertas seguem este território mesmo que o mapa navegue para outra região.`
            : "Monitorando a área visível do mapa. Fixe um município (ex.: Mogi das Cruzes) para vigilância contínua com raio definido."}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(LEVEL_STYLE) as Level[]).map((l) => (
          <div key={l} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-white/40">{LEVEL_STYLE[l].label}</div>
            <div className="font-mono text-lg" style={{ color: LEVEL_STYLE[l].color }}>{counts[l]}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {alerts.length === 0 && !loading && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center text-[11px] text-white/50">
            {active
              ? `Nenhum alerta ativo em ${active.name} num raio de ${active.radiusKm} km. Aumente o raio para ampliar a vigilância.`
              : "Nenhum alerta ativo na área visível. Afaste o mapa para varrer uma região maior."}
          </div>
        )}
        {alerts.map((a) => (
          <div
            key={a.id}
            className="group flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2 transition-all hover:border-white/25 hover:bg-white/[0.07]"
          >
            <button
              type="button"
              onClick={() => bus.emit("map.flyTo", { lat: a.lat, lng: a.lng, zoom: a.kind === "ciclone" ? 5 : 9 })}
              className="flex min-w-0 flex-1 items-start gap-2 text-left active:scale-[0.99]"
            >
              <span className="mt-0.5 text-base leading-none">{KIND_ICON[a.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: LEVEL_STYLE[a.level].color, boxShadow: `0 0 8px ${LEVEL_STYLE[a.level].color}` }}
                  />
                  <span className="truncate text-[12px] font-medium text-white/90">{a.title}</span>
                  {a.km != null && (
                    <span className="shrink-0 font-mono text-[10px] text-white/40">{a.km.toFixed(0)} km</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-white/50">{a.detail}</span>
              </span>
            </button>
            <button
              type="button"
              title="Ver histórico neste local"
              onClick={() => {
                bus.emit("map.flyTo", { lat: a.lat, lng: a.lng, zoom: a.kind === "ciclone" ? 5 : 9 });
                bus.emit("app.open", { appId: "timemachine", payload: { lat: a.lat, lng: a.lng } });
              }}
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-white/50 transition-all hover:bg-white/10 hover:text-white active:scale-90"
            >
              <History className="h-3.5 w-3.5" />
            </button>
            <AlertTriangle className="mt-1.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" style={{ color: LEVEL_STYLE[a.level].color }} />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-[10px] leading-relaxed text-white/45">
        <Wind className="mr-1 inline h-3 w-3" />
        Fontes: Open-Meteo Flood/GloFAS (enchentes) · NOAA National Hurricane Center (ciclones) · NASA/INPE (focos de calor) · USGS (sismos) · Open-Meteo Air Quality.
      </div>
    </div>
  );
}
