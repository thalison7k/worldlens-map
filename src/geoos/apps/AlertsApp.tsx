import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, BellOff, History, RefreshCw, Wind } from "lucide-react";
import { bus } from "@/geoos/core/bus";
import { useBus } from "@/geoos/core/useBus";
import { getMapSnapshot } from "@/geoos/core/map-state";
import { fetchFires } from "@/lib/gis/providers/firms";
import { fetchEarthquakes } from "@/lib/gis/providers/usgs";
import { fetchAirStations } from "@/lib/gis/providers/openaq";
import { fetchCyclones, cycloneCategory, bearingLabel } from "@/lib/gis/providers/cyclones";
import { fetchFloodRisk, FLOOD_LEVEL_LABEL } from "@/lib/gis/providers/floods";
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


function inside(b: BBox, lat: number, lng: number) {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

/**
 * AlertsApp — central de alertas ambientais.
 *
 * Cruza ciclones tropicais (NOAA NHC, cobertura global), focos de calor,
 * sismos e qualidade do ar da área visível e classifica cada evento por
 * severidade. Alertas críticos disparam notificação no Activity Center.
 */
export default function AlertsApp() {
  const [bbox, setBbox] = useState<BBox>(() => getMapSnapshot().bbox);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notify, setNotify] = useState(true);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useBus("map.bbox", (b) => setBbox([b.west, b.south, b.east, b.north]));

  const load = useCallback(async (box: BBox) => {
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



    const order: Record<Level, number> = { critico: 0, alto: 1, moderado: 2 };
    out.sort((x, y) => order[x.level] - order[y.level] || y.when - x.when);
    setAlerts(out);
    setUpdatedAt(Date.now());
    setLoading(false);
    return out;
  }, []);

  useEffect(() => {
    let alive = true;
    const run = () => {
      void load(bbox).then((out) => {
        if (!alive || !notify) return;
        const fresh = out.filter((a) => a.level === "critico" && !seen.has(a.id));
        if (fresh.length) {
          setSeen((s) => new Set([...s, ...fresh.map((a) => a.id)]));
          bus.emit("notify", {
            title: `${fresh.length} alerta(s) crítico(s)`,
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
  }, [bbox.map((v) => Math.round(v)).join(","), notify]);

  const counts = useMemo(() => ({
    critico: alerts.filter((a) => a.level === "critico").length,
    alto: alerts.filter((a) => a.level === "alto").length,
    moderado: alerts.filter((a) => a.level === "moderado").length,
  }), [alerts]);

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
            onClick={() => void load(bbox)}
            title="Atualizar agora"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition-all hover:bg-white/10 active:scale-90"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
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
            Nenhum alerta ativo na área visível. Afaste o mapa para varrer uma região maior.
          </div>
        )}
        {alerts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => bus.emit("map.flyTo", { lat: a.lat, lng: a.lng, zoom: a.kind === "ciclone" ? 5 : 9 })}
            className="group flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-left transition-all hover:border-white/25 hover:bg-white/[0.07] active:scale-[0.99]"
          >
            <span className="mt-0.5 text-base leading-none">{KIND_ICON[a.kind]}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: LEVEL_STYLE[a.level].color, boxShadow: `0 0 8px ${LEVEL_STYLE[a.level].color}` }}
                />
                <span className="truncate text-[12px] font-medium text-white/90">{a.title}</span>
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-white/50">{a.detail}</span>
            </span>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" style={{ color: LEVEL_STYLE[a.level].color }} />
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-[10px] leading-relaxed text-white/45">
        <Wind className="mr-1 inline h-3 w-3" />
        Fontes: NOAA National Hurricane Center (ciclones) · NASA/INPE (focos de calor) · USGS (sismos) · Open-Meteo Air Quality.
      </div>
    </div>
  );
}
