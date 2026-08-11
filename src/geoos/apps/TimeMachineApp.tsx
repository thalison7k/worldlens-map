import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Globe2, Pause, Play, RotateCcw, Satellite, SkipBack, SkipForward } from "lucide-react";
import { bus } from "@/geoos/core/bus";
import { useBus } from "@/geoos/core/useBus";
import { getMapSnapshot } from "@/geoos/core/map-state";
import { fetchHistory, pmLevel, type HistoryDay } from "@/lib/gis/providers/history";

const RANGES = [
  { days: 14, label: "14 d" },
  { days: 30, label: "30 d" },
  { days: 90, label: "90 d" },
] as const;

const SPEEDS = [
  { ms: 900, label: "1x" },
  { ms: 450, label: "2x" },
  { ms: 200, label: "4x" },
] as const;

/**
 * TimeMachineApp — "máquina do tempo" ambiental.
 *
 * Reconstrói a série histórica (ERA5 + qualidade do ar) do centro da área
 * visível e, em sincronia, projeta sobre o mapa a imagem de satélite NASA GIBS
 * do dia selecionado. Play/pause anima a evolução dia a dia.
 */
export default function TimeMachineApp() {
  const [center, setCenter] = useState(() => getMapSnapshot().center);
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(450);
  const [satellite, setSatellite] = useState(true);
  const [globe, setGlobe] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useBus("map.bbox", (b) => {
    setCenter({ lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 });
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHistory(center.lat, center.lng, days)
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setI(Math.max(0, r.length - 1));
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [center.lat.toFixed(2), center.lng.toFixed(2), days]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = rows[i];

  // Sincroniza satélite histórico com a data escolhida. A timeline global só é
  // notificada quando a FAIXA muda (14/30/90 d) — emitir a cada dia fazia as
  // camadas piscarem e travarem o mapa durante o play.
  useEffect(() => {
    if (!current) return;
    bus.emit("timemachine.date", { date: satellite ? current.date : null });
  }, [current?.date, satellite]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bus.emit("timeline.change", { t: Date.now(), range: days >= 90 ? "12m" : "30d" });
  }, [days]);

  // Modo globo: mundo esférico navegável enquanto a linha do tempo está aberta.
  useEffect(() => {
    bus.emit("map.globe", { on: globe });
  }, [globe]);

  useEffect(() => () => {
    bus.emit("timemachine.date", { date: null });
    bus.emit("map.globe", { on: false });
  }, []);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!playing || rows.length === 0) return;
    timer.current = setInterval(() => {
      setI((p) => (p + 1 >= rows.length ? 0 : p + 1));
    }, speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, rows.length]);

  const step = useCallback((d: number) => {
    setPlaying(false);
    setI((p) => Math.min(rows.length - 1, Math.max(0, p + d)));
  }, [rows.length]);

  const chart = useMemo(
    () => rows.map((r, idx) => ({
      idx,
      label: r.date.slice(5),
      tmax: r.tmax,
      precip: r.precip,
      pm25: r.pm25 != null ? Number(r.pm25.toFixed(1)) : null,
    })),
    [rows],
  );

  const stats = useMemo(() => {
    const t = rows.map((r) => r.tmax).filter((v): v is number => v != null);
    const p = rows.map((r) => r.precip).filter((v): v is number => v != null);
    const a = rows.map((r) => r.pm25).filter((v): v is number => v != null);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    return { tAvg: avg(t), pSum: p.reduce((s, x) => s + x, 0), aAvg: avg(a) };
  }, [rows]);

  const pm = pmLevel(current?.pm25 ?? null);
  const anomaly = current?.tmax != null && stats.tAvg != null ? current.tmax - stats.tAvg : null;

  /** Chuva acumulada em 72 h até a data selecionada — proxy de risco de enchente. */
  const rain72 = useMemo(
    () => rows.slice(Math.max(0, i - 2), i + 1).reduce((s, r) => s + (r.precip ?? 0), 0),
    [rows, i],
  );
  const floodRisk =
    rain72 >= 150 ? { label: "Extremo", color: "#7c2d12" }
    : rain72 >= 90 ? { label: "Alto", color: "#dc2626" }
    : rain72 >= 45 ? { label: "Moderado", color: "#f59e0b" }
    : { label: "Baixo", color: "#38bdf8" };


  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2 text-white/85">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] uppercase tracking-widest text-white/45">Máquina do tempo ambiental</div>
          <div className="truncate font-mono text-[11px] text-white/60">
            {center.lat.toFixed(2)}, {center.lng.toFixed(2)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setGlobe((g) => !g)}
            title="Mundo em formato esférico (modo globo)"
            className={`grid h-8 w-8 place-items-center rounded-full border transition-all active:scale-95 ${
              globe
                ? "border-sky-400/60 bg-sky-400/15 text-white"
                : "border-white/10 bg-white/[0.03] text-white/60"
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setSatellite((s) => !s)}
            title="Sobrepor imagem de satélite histórica (NASA GIBS)"
            className={`flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] transition-all active:scale-95 ${
              satellite
                ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/15 text-white"
                : "border-white/10 bg-white/[0.03] text-white/60"
            }`}
          >
            <Satellite className="h-3.5 w-3.5" /> Satélite
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`h-7 rounded-full border px-2.5 text-[11px] transition-all active:scale-95 ${
              days === r.days ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/55"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        {SPEEDS.map((s) => (
          <button
            key={s.ms}
            onClick={() => setSpeed(s.ms)}
            className={`h-7 rounded-full border px-2 text-[11px] transition-all active:scale-95 ${
              speed === s.ms ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/55"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm text-white">
            {current ? new Date(`${current.date}T12:00:00Z`).toLocaleDateString("pt-BR") : loading ? "carregando…" : "—"}
          </span>
          {anomaly != null && (
            <span className={`text-[11px] ${anomaly >= 0 ? "text-orange-300" : "text-sky-300"}`}>
              {anomaly >= 0 ? "+" : ""}{anomaly.toFixed(1)} °C vs média
            </span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Kpi label="Máx." value={current?.tmax != null ? `${current.tmax.toFixed(1)}°` : "—"} color="#fb923c" />
          <Kpi label="Chuva" value={current?.precip != null ? `${current.precip.toFixed(1)} mm` : "—"} color="#38bdf8" />
          <Kpi label={`PM2.5 · ${pm.label}`} value={current?.pm25 != null ? current.pm25.toFixed(0) : "—"} color={pm.color} />
        </div>
        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/55">
          <span className="mr-1">🌊</span>
          Enchente · chuva 72 h {rain72.toFixed(0)} mm ·{" "}
          <span style={{ color: floodRisk.color }}>{floodRisk.label}</span>
        </div>

      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, rows.length - 1)}
        value={i}
        onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
        aria-label="Linha do tempo"
        className="h-8 w-full touch-manipulation accent-[color:var(--geoos-accent)]"
      />

      <div className="flex items-center justify-center gap-2">
        <Ctrl title="Anterior" onClick={() => step(-1)}><SkipBack className="h-4 w-4" /></Ctrl>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "Pausar" : "Reproduzir"}
          className="grid h-11 w-11 place-items-center rounded-full border border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/20 text-white transition-transform hover:scale-105 active:scale-95"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <Ctrl title="Próximo" onClick={() => step(1)}><SkipForward className="h-4 w-4" /></Ctrl>
        <Ctrl title="Voltar ao presente" onClick={() => { setPlaying(false); setI(rows.length - 1); }}>
          <RotateCcw className="h-4 w-4" />
        </Ctrl>
      </div>

      <div className="h-36 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="rgba(255,255,255,.06)" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "rgba(255,255,255,.45)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,.45)" }} />
            <Tooltip
              contentStyle={{ background: "rgba(10,14,20,.92)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 11 }}
            />
            <Area type="monotone" dataKey="tmax" stroke="#fb923c" fill="rgba(251,146,60,.18)" strokeWidth={1.6} name="Temp. máx (°C)" />
            <Area type="monotone" dataKey="pm25" stroke="#a78bfa" fill="rgba(167,139,250,.14)" strokeWidth={1.4} name="PM2.5 (µg/m³)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-[11px] leading-relaxed text-white/60">
        No período: média de {stats.tAvg != null ? `${stats.tAvg.toFixed(1)} °C` : "—"} de máxima,
        {" "}{stats.pSum.toFixed(0)} mm de chuva acumulada e PM2.5 médio de{" "}
        {stats.aAvg != null ? `${stats.aAvg.toFixed(1)} µg/m³` : "—"}.
        <div className="mt-1 text-white/35">Fontes: Open-Meteo (ERA5 · Air Quality) · NASA GIBS MODIS Terra.</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-1.5 py-1.5">
      <div className="truncate text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="font-mono text-sm" style={{ color }}>{value}</div>
    </div>
  );
}

function Ctrl({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-9 w-9 touch-manipulation place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition-all hover:bg-white/10 active:scale-90"
    >
      {children}
    </button>
  );
}
