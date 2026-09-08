import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Building2,
  FileSpreadsheet,
  FileText,
  RefreshCw,
} from "lucide-react";
import {
  FONTES_REAIS,
  getMonitoredSlug,
  getPrefeitura,
  setMonitored,
  type Prefeitura,
} from "@/lib/prefeituras";
import { bboxAround } from "@/geoos/core/watchpoints";
import { buildAlerts, countByLevel, KIND_ICON, LEVEL_STYLE, type EnvAlert } from "@/lib/gis/alerts";
import { fetchForecast, weatherLabel, type ForecastBundle } from "@/lib/gis/providers/openmeteo";
import { fetchFloodRisk, FLOOD_LEVEL_LABEL, type FloodCell } from "@/lib/gis/providers/floods";
import { exportExcel, exportWord, stamp } from "@/lib/gis/office-export";

export const Route = createFileRoute("/prefeituras/$slug")({
  head: () => ({
    meta: [
      { title: "Painel municipal — Alertas e dados ambientais | GeoOS" },
      {
        name: "description",
        content:
          "Painel da prefeitura: alertas ambientais, clima, risco de enchente e relatórios em Excel e Word.",
      },
      { property: "og:title", content: "Painel municipal — Alertas e dados ambientais | GeoOS" },
      {
        property: "og:description",
        content:
          "Alertas críticos, previsão do tempo e risco de alagamento do município, com exportação institucional.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrefeituraDashboard,
});

function PrefeituraDashboard() {
  const { slug } = useParams({ from: "/prefeituras/$slug" });
  const [pref, setPref] = useState<Prefeitura | null | undefined>(undefined);
  const [monitored, setMonitoredSlug] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<EnvAlert[]>([]);
  const [forecast, setForecast] = useState<ForecastBundle | null>(null);
  const [floods, setFloods] = useState<FloodCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    setPref(getPrefeitura(slug));
    setMonitoredSlug(getMonitoredSlug());
  }, [slug]);

  const load = useCallback(async (p: Prefeitura) => {
    setLoading(true);
    const box = bboxAround(p.lat, p.lng, p.radiusKm);
    const [a, f, fl] = await Promise.all([
      buildAlerts(box, { lat: p.lat, lng: p.lng, radiusKm: p.radiusKm }).catch(() => []),
      fetchForecast(p.lat, p.lng).catch(() => null),
      fetchFloodRisk(box, 4).catch(() => []),
    ]);
    if (!alive.current) return;
    setAlerts(a);
    setForecast(f);
    setFloods(fl);
    setUpdated(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    if (pref) {
      void load(pref);
      const t = setInterval(() => void load(pref), 120_000);
      return () => {
        alive.current = false;
        clearInterval(t);
      };
    }
    return () => {
      alive.current = false;
    };
  }, [pref, load]);

  // Apenas alertas ativos: eventos registrados nas últimas 24 horas.
  const ACTIVE_MS = 24 * 60 * 60 * 1000;
  const activeAlerts = useMemo(
    () => alerts.filter((a) => Date.now() - a.when <= ACTIVE_MS),
    [alerts, ACTIVE_MS],
  );
  const counts = useMemo(() => countByLevel(activeAlerts), [activeAlerts]);
  const today = forecast?.days?.[0];
  const now = forecast?.hours?.[0];
  const maxFlood = useMemo(() => floods.reduce((m, f) => Math.max(m, f.risk), 0), [floods]);
  const isMonitored = !!pref && monitored === pref.slug;

  const meta = pref
    ? {
        Município: `${pref.name}${pref.uf ? ` · ${pref.uf}` : ""}`,
        Coordenadas: `${pref.lat.toFixed(4)}, ${pref.lng.toFixed(4)}`,
        "Raio monitorado (km)": pref.radiusKm,
        "Gerado em": new Date().toLocaleString("pt-BR"),
        Fontes: FONTES_REAIS.map((f) => f.label).join(", "),
      }
    : {};

  const alertRows = activeAlerts.map((a) => [
    LEVEL_STYLE[a.level].label,
    a.kind,
    a.title,
    a.detail,
    a.km != null ? Number(a.km.toFixed(1)) : "",
    a.lat.toFixed(4),
    a.lng.toFixed(4),
    new Date(a.when).toLocaleString("pt-BR"),
  ]);
  const alertCols = ["Severidade", "Tipo", "Evento", "Detalhe", "Distância (km)", "Lat", "Lng", "Quando"];

  const dayRows = (forecast?.days ?? []).map((d) => [
    new Date(d.date).toLocaleDateString("pt-BR"),
    weatherLabel(d.code),
    d.tMin,
    d.tMax,
    d.precipProb,
    d.precipSum,
    d.windMax,
    d.uvMax,
  ]);
  const dayCols = ["Data", "Condição", "Mín (°C)", "Máx (°C)", "Chuva (%)", "Chuva (mm)", "Vento (km/h)", "UV"];

  const floodRows = floods.map((f) => [
    FLOOD_LEVEL_LABEL[f.level],
    f.risk,
    Number(f.rain72.toFixed(1)),
    f.lat.toFixed(4),
    f.lng.toFixed(4),
  ]);
  const floodCols = ["Nível", "Risco (0-100)", "Chuva 72h (mm)", "Lat", "Lng"];

  function onExcel() {
    if (!pref) return;
    exportExcel(
      `painel-${pref.slug}-${stamp()}`,
      [
        { name: "Alertas", columns: alertCols, rows: alertRows },
        { name: "Previsao7dias", columns: dayCols, rows: dayRows },
        { name: "RiscoEnchente", columns: floodCols, rows: floodRows },
      ],
      meta,
    );
  }

  function onWord() {
    if (!pref) return;
    exportWord(
      `relatorio-${pref.slug}-${stamp()}`,
      `Relatório ambiental — Prefeitura de ${pref.name}${pref.uf ? ` (${pref.uf})` : ""}`,
      [
        {
          title: "Resumo executivo",
          paragraphs: [
            `Território monitorado num raio de ${pref.radiusKm} km a partir de ${pref.lat.toFixed(4)}, ${pref.lng.toFixed(4)}.`,
            `Alertas ativos: ${counts.critico} críticos, ${counts.alto} altos e ${counts.moderado} moderados.`,
            today
              ? `Previsão para hoje: ${weatherLabel(today.code)}, mínima de ${today.tMin}°C e máxima de ${today.tMax}°C, com ${today.precipProb}% de probabilidade de chuva.`
              : "Previsão meteorológica indisponível no momento.",
            `Risco máximo de alagamento detectado na malha analisada: ${maxFlood}/100.`,
          ],
        },
        { title: "Alertas ativos", columns: alertCols, rows: alertRows },
        { title: "Previsão para 7 dias", columns: dayCols, rows: dayRows },
        { title: "Risco de enchente por célula", columns: floodCols, rows: floodRows },
      ],
      `${new Date().toLocaleString("pt-BR")} · Fontes: ${FONTES_REAIS.map((f) => f.label).join(", ")}`,
    );
  }

  if (pref === undefined) {
    return <main className="geoos-shell min-h-screen bg-[color:var(--geoos-bg,#0a0f1a)]" />;
  }

  if (!pref) {
    return (
      <main className="geoos-shell grid min-h-screen place-items-center bg-[color:var(--geoos-bg,#0a0f1a)] px-4 text-center text-white">
        <div>
          <h1 className="text-xl font-semibold">Prefeitura não encontrada</h1>
          <p className="mt-2 text-sm text-white/55">Cadastre o município na lista de prefeituras.</p>
          <Link
            to="/prefeituras"
            className="mt-4 inline-block text-sm text-[color:var(--geoos-accent)]"
          >
            ← Ver prefeituras
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="geoos-shell min-h-screen bg-[color:var(--geoos-bg,#0a0f1a)] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          to="/prefeituras"
          className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> Prefeituras
        </Link>

        <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-white/10 bg-[color:var(--geoos-accent)]/15 text-[color:var(--geoos-accent)]">
              <Building2 className="size-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Prefeitura de {pref.name}
                {pref.uf ? <span className="text-white/45"> · {pref.uf}</span> : null}
              </h1>
              <p className="text-xs text-white/50">
                Raio de {pref.radiusKm} km ·{" "}
                {updated
                  ? `atualizado ${new Date(updated).toLocaleTimeString("pt-BR")}`
                  : "carregando…"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={isMonitored}
              onClick={() => {
                const next = isMonitored ? null : pref.slug;
                setMonitored(next);
                setMonitoredSlug(next);
              }}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                isMonitored
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                  : "border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/10"
              }`}
            >
              {isMonitored ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              {isMonitored ? "Monitorada" : "Monitorar"}
            </button>
            <button
              onClick={() => void load(pref)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm hover:border-[color:var(--geoos-accent)]/60"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
            <button
              onClick={onExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm hover:border-[color:var(--geoos-accent)]/60"
            >
              <FileSpreadsheet className="size-4" /> Excel
            </button>
            <button
              onClick={onWord}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm hover:border-[color:var(--geoos-accent)]/60"
            >
              <FileText className="size-4" /> Word
            </button>
          </div>
        </header>

        {monitored && !isMonitored && (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/55">
            As notificações estão vinculadas a outro município. Só uma prefeitura é monitorada por
            vez — ative aqui para trocar.
          </p>
        )}

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Críticos" value={counts.critico} tone="#f87171" />
          <Kpi label="Altos" value={counts.alto} tone="#fb923c" />
          <Kpi label="Moderados" value={counts.moderado} tone="#facc15" />
          <Kpi label="Risco enchente" value={`${maxFlood}/100`} tone="#38bdf8" />
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Temperatura" value={now ? `${now.temp.toFixed(0)}°C` : "—"} />
          <Kpi label="Umidade" value={now ? `${now.humidity.toFixed(0)}%` : "—"} />
          <Kpi label="Vento" value={now ? `${now.wind.toFixed(0)} km/h` : "—"} />
          <Kpi label="Chuva agora" value={now ? `${now.precipProb.toFixed(0)}%` : "—"} />
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Alertas ativos no município
          </h2>
          <div className="mt-3 space-y-2">
            {activeAlerts.length === 0 && (
              <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
                {loading
                  ? "Consultando fontes ambientais…"
                  : "Nenhum alerta ativo no raio monitorado."}
              </p>
            )}
            {activeAlerts.slice(0, 25).map((a) => (
              <article
                key={a.id}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3"
              >
                <span className="text-lg leading-none">{KIND_ICON[a.kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{a.title}</h3>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white"
                      style={{ background: LEVEL_STYLE[a.level].color }}
                    >
                      {LEVEL_STYLE[a.level].label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/55">{a.detail}</p>
                </div>
                {a.km != null && (
                  <span className="shrink-0 text-xs text-white/45">{a.km.toFixed(0)} km</span>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Previsão para 7 dias
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(forecast?.days ?? []).map((d) => (
              <div
                key={d.date}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-center"
              >
                <p className="text-xs text-white/50">
                  {new Date(d.date).toLocaleDateString("pt-BR", {
                    weekday: "short",
                    day: "2-digit",
                  })}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {d.tMax.toFixed(0)}° <span className="text-white/45">{d.tMin.toFixed(0)}°</span>
                </p>
                <p className="mt-1 text-[11px] text-white/50">{weatherLabel(d.code)}</p>
                <p className="text-[11px] text-sky-300">
                  {d.precipProb}% · {d.precipSum.toFixed(1)} mm
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Fontes reais consultadas
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FONTES_REAIS.map((f) => (
              <li key={f.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs font-medium text-white/85">{f.label}</p>
                <p className="mt-0.5 text-[11px] text-white/45">{f.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-[11px] text-white/35">
          Dados públicos em tempo real · Projeto Integrador VI — Univesp · by GamaTec IA
        </p>
      </div>
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
      <p className="text-[11px] uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-xl font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  );
}
