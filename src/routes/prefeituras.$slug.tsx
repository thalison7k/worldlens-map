import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { getPrefeitura, type Prefeitura } from "@/lib/prefeituras";
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
  const [alerts, setAlerts] = useState<EnvAlert[]>([]);
  const [forecast, setForecast] = useState<ForecastBundle | null>(null);
  const [floods, setFloods] = useState<FloodCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    setPref(getPrefeitura(slug));
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

  const counts = useMemo(() => countByLevel(alerts), [alerts]);
  const today = forecast?.days?.[0];
  const now = forecast?.hours?.[0];
  const maxFlood = useMemo(
    () => floods.reduce((m, f) => Math.max(m, f.risk), 0),
    [floods],
  );

  const meta = pref
    ? {
        Município: `${pref.name}${pref.uf ? ` · ${pref.uf}` : ""}`,
        Coordenadas: `${pref.lat.toFixed(4)}, ${pref.lng.toFixed(4)}`,
        "Raio monitorado (km)": pref.radiusKm,
        "Gerado em": new Date().toLocaleString("pt-BR"),
        Fontes: "NASA FIRMS/INPE, USGS, OpenAQ, Open-Meteo, GloFAS, NOAA NHC",
      }
    : {};

  const alertRows = alerts.map((a) => [
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
      `${new Date().toLocaleString("pt-BR")} · Fontes: NASA FIRMS/INPE, USGS, OpenAQ, Open-Meteo, GloFAS, NOAA NHC`,
    );
  }

  if (pref === undefined) {
    return <main className="min-h-screen bg-background" />;
  }

  if (!pref) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 text-center text-foreground">
        <div>
          <h1 className="text-xl font-semibold">Prefeitura não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre o município na lista de prefeituras.
          </p>
          <Link to="/prefeituras" className="mt-4 inline-block text-sm text-primary">
            ← Ver prefeituras
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          to="/prefeituras"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Prefeituras
        </Link>

        <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <Building2 className="size-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Prefeitura de {pref.name}
                {pref.uf ? <span className="text-muted-foreground"> · {pref.uf}</span> : null}
              </h1>
              <p className="text-xs text-muted-foreground">
                Raio de {pref.radiusKm} km ·{" "}
                {updated ? `atualizado ${new Date(updated).toLocaleTimeString("pt-BR")}` : "carregando…"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void load(pref)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/60"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
            <button
              onClick={onExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/60"
            >
              <FileSpreadsheet className="size-4" /> Excel
            </button>
            <button
              onClick={onWord}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/60"
            >
              <FileText className="size-4" /> Word
            </button>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Críticos" value={counts.critico} tone="#dc2626" />
          <Kpi label="Altos" value={counts.alto} tone="#f97316" />
          <Kpi label="Moderados" value={counts.moderado} tone="#eab308" />
          <Kpi label="Risco enchente" value={`${maxFlood}/100`} tone="#38bdf8" />
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-4">
          <Kpi label="Temperatura" value={now ? `${now.temp.toFixed(0)}°C` : "—"} />
          <Kpi label="Umidade" value={now ? `${now.humidity.toFixed(0)}%` : "—"} />
          <Kpi label="Vento" value={now ? `${now.wind.toFixed(0)} km/h` : "—"} />
          <Kpi label="Chuva agora" value={now ? `${now.precipProb.toFixed(0)}%` : "—"} />
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Alertas ativos no município
          </h2>
          <div className="mt-3 space-y-2">
            {alerts.length === 0 && (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                {loading ? "Consultando fontes ambientais…" : "Nenhum alerta ativo no raio monitorado."}
              </p>
            )}
            {alerts.slice(0, 25).map((a) => (
              <article
                key={a.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
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
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>
                </div>
                {a.km != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">{a.km.toFixed(0)} km</span>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Previsão para 7 dias
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(forecast?.days ?? []).map((d) => (
              <div key={d.date} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  {new Date(d.date).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" })}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {d.tMax.toFixed(0)}° <span className="text-muted-foreground">{d.tMin.toFixed(0)}°</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{weatherLabel(d.code)}</p>
                <p className="text-[11px] text-sky-500">{d.precipProb}% · {d.precipSum.toFixed(1)} mm</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-10 text-[11px] text-muted-foreground">
          Fontes reais: NASA FIRMS/INPE, USGS, OpenAQ, Open-Meteo, GloFAS e NOAA NHC · Projeto
          Integrador VI — Univesp · by GamaTec IA
        </p>
      </div>
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  );
}
