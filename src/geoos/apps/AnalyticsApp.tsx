import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, RefreshCw } from "lucide-react";
import { useBus } from "@/geoos/core/useBus";
import { getMapSnapshot } from "@/geoos/core/map-state";
import { exportExcel, exportWord, stamp, type Cell as XCell } from "@/lib/gis/office-export";
import { fetchEarthquakes, magColor, type Quake } from "@/lib/gis/providers/usgs";
import { fetchAirStations, type AirStation } from "@/lib/gis/providers/openaq";
import { fetchWeather, type WeatherPoint } from "@/lib/gis/providers/openmeteo";
import { fetchFires, type FirePoint } from "@/lib/gis/providers/firms";
import type { BBox } from "@/lib/gis/simulated";

/**
 * AnalyticsApp — visualizações em tempo real dos dados carregados.
 * Todos os gráficos são recalculados para a área visível (bbox) do mapa e
 * podem ser exportados em Excel, Word, CSV ou JSON para relatórios oficiais.
 */
const inBox = (b: BBox, lat: number, lng: number) =>
  lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];

export default function AnalyticsApp() {
  const snap = getMapSnapshot();
  const [bbox, setBbox] = useState<BBox>(snap.bbox ?? [-90, -60, 90, 60]);
  const [quakes, setQuakes] = useState<Quake[]>([]);
  const [air, setAir] = useState<AirStation[]>([]);
  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [fires, setFires] = useState<FirePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [menu, setMenu] = useState(false);
  const boxRef = useRef(bbox);
  boxRef.current = bbox;

  useBus("map.bbox", (b) => setBbox([b.west, b.south, b.east, b.north]));

  const load = useCallback(async () => {
    const b = boxRef.current;
    setLoading(true);
    try {
      const [q, a, w, f] = await Promise.all([
        fetchEarthquakes("day"),
        fetchAirStations(b, 100),
        fetchWeather(b, 24),
        fetchFires(b, 1),
      ]);
      // Recorte espacial: somente eventos dentro da área visível.
      setQuakes(q.filter((x) => inBox(b, x.lat, x.lng)));
      setAir(a);
      setWeather(w);
      setFires(f);
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void load().then(() => { if (!alive) return; });
    const iv = setInterval(() => { if (!document.hidden) void load(); }, 180_000);
    return () => { alive = false; clearInterval(iv); };
  }, [bbox.join(","), load]); // eslint-disable-line react-hooks/exhaustive-deps

  const magBuckets = useMemo(() => {
    const b = [0, 0, 0, 0, 0, 0];
    for (const q of quakes) {
      const m = Math.min(5, Math.max(0, Math.floor(q.mag)));
      b[m]++;
    }
    return b.map((v, i) => ({ label: i === 5 ? "≥ 5" : `${i}–${i + 1}`, value: v, color: magColor(i) }));
  }, [quakes]);

  const firesByHour = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of fires) {
      const h = f.time.padStart(4, "0").slice(0, 2);
      map.set(`${h}h`, (map.get(`${h}h`) ?? 0) + 1);
    }
    return Array.from(map, ([k, v]) => ({ label: k, value: v })).sort((a, b) => a.label.localeCompare(b.label));
  }, [fires]);

  const aqiByCity = useMemo(
    () =>
      air
        .slice(0, 12)
        .map((s) => ({ label: s.city.slice(0, 12), value: Math.round(s.value) }))
        .sort((a, b) => b.value - a.value),
    [air],
  );

  const weatherSeries = useMemo(
    () =>
      weather.slice(0, 12).map((w) => ({
        label: w.city.slice(0, 10),
        temp: Math.round(w.temp),
        wind: Math.round(w.windSpeed),
      })),
    [weather],
  );

  const bboxLabel = `${bbox[1].toFixed(1)},${bbox[0].toFixed(1)} → ${bbox[3].toFixed(1)},${bbox[2].toFixed(1)}`;

  const datasets = useCallback(() => {
    const meta = {
      Módulo: "Analytics ambiental",
      "Área analisada (bbox)": bboxLabel,
      "Gerado em": new Date().toLocaleString("pt-BR"),
      Fontes: "USGS · OpenAQ · Open-Meteo · NASA FIRMS",
    };
    const sheets = [
      {
        name: "Terremotos",
        columns: ["Local", "Magnitude", "Prof. (km)", "Latitude", "Longitude", "Data/hora"],
        rows: quakes.map((q) => [q.place, q.mag, q.depth, q.lat, q.lng, new Date(q.time).toLocaleString("pt-BR")] as XCell[]),
      },
      {
        name: "Qualidade do ar",
        columns: ["Cidade", "Parâmetro", "Valor", "Unidade", "Latitude", "Longitude"],
        rows: air.map((s) => [s.city, s.parameter, s.value, s.unit, s.lat, s.lng] as XCell[]),
      },
      {
        name: "Clima",
        columns: ["Cidade", "Temp (°C)", "Vento (km/h)", "Umidade (%)", "Latitude", "Longitude"],
        rows: weather.map((w) => [w.city, w.temp, w.windSpeed, w.humidity, w.lat, w.lng] as XCell[]),
      },
      {
        name: "Focos de calor",
        columns: ["Latitude", "Longitude", "FRP (MW)", "Confiança", "Hora UTC", "Satélite"],
        rows: fires.map((f) => [f.lat, f.lng, f.frp, f.confidence, f.time, f.satellite ?? "—"] as XCell[]),
      },
    ];
    return { meta, sheets };
  }, [quakes, air, weather, fires, bboxLabel]);

  const doExport = (fmt: "xls" | "doc" | "csv" | "json") => {
    setMenu(false);
    const { meta, sheets } = datasets();
    const base = `geoos-analytics-${stamp()}`;
    if (fmt === "xls") return exportExcel(base, sheets, meta);
    if (fmt === "doc")
      return exportWord(
        base,
        "Relatório de Analytics Ambiental",
        [
          { title: "Contexto", paragraphs: Object.entries(meta).map(([k, v]) => `${k}: ${v}`) },
          ...sheets.map((s) => ({ title: s.name, columns: s.columns, rows: s.rows })),
        ],
        `Área analisada ${bboxLabel}`,
      );
    if (fmt === "json") {
      dl(`${base}.json`, JSON.stringify({ meta, sheets }, null, 2), "application/json");
      return;
    }
    const csv = sheets
      .map((s) => [s.name, s.columns.join(";"), ...s.rows.map((r) => r.map((c) => String(c ?? "")).join(";"))].join("\n"))
      .join("\n\n");
    dl(`${base}.csv`, csv, "text/csv;charset=utf-8");
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 text-white">
      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold">Área visível · {bboxLabel}</div>
          <div className="text-[10px] text-white/45">
            {loading ? "Atualizando…" : `Atualizado ${new Date(updatedAt).toLocaleTimeString("pt-BR")}`}
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void load()}
            title="Atualizar agora"
            className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-white/70 transition active:scale-95 hover:bg-white/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            title="Exportar dados"
            className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-white/70 transition active:scale-95 hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {menu && (
            <div className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-white/10 bg-[#0b1220]/95 p-1 shadow-xl backdrop-blur">
              {([
                ["xls", "Excel (.xls)"],
                ["doc", "Word (.doc)"],
                ["csv", "CSV (planilha)"],
                ["json", "JSON (bruto)"],
              ] as const).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => doExport(f)}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-[11px] text-white/80 transition hover:bg-white/10"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ChartCard title={`Terremotos por magnitude · ${quakes.length} na área`}>

        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={magBuckets}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="label" stroke="#ffffff70" fontSize={10} />
            <YAxis stroke="#ffffff70" fontSize={10} />
            <Tooltip contentStyle={tt} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {magBuckets.map((b) => <Cell key={b.label} fill={b.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={`AQI por cidade · PM2.5 · ${air.length} estações`}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={aqiByCity} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis type="number" stroke="#ffffff70" fontSize={10} />
            <YAxis type="category" dataKey="label" stroke="#ffffff70" fontSize={9} width={70} />
            <Tooltip contentStyle={tt} />
            <Bar dataKey="value" fill="#38bdf8" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Temperatura e vento por cidade">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={weatherSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="label" stroke="#ffffff70" fontSize={9} angle={-30} textAnchor="end" height={40} />
            <YAxis yAxisId="l" stroke="#f97316" fontSize={10} />
            <YAxis yAxisId="r" orientation="right" stroke="#38bdf8" fontSize={10} />
            <Tooltip contentStyle={tt} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line yAxisId="l" type="monotone" dataKey="temp" name="Temp °C" stroke="#f97316" strokeWidth={2} dot={false} />
            <Line yAxisId="r" type="monotone" dataKey="wind" name="Vento km/h" stroke="#38bdf8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={`Focos de incêndio por hora UTC · ${fires.length} total`}>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={firesByHour}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="label" stroke="#ffffff70" fontSize={9} />
            <YAxis stroke="#ffffff70" fontSize={10} />
            <Tooltip contentStyle={tt} />
            <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <p className="mt-2 text-[10px] leading-relaxed text-white/40">
        Análises calculadas sobre o bbox atual do mapa. Fontes: USGS · OpenAQ · Open-Meteo · NASA FIRMS.
      </p>
    </div>
  );
}

const tt = {
  background: "rgba(15,23,42,0.95)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 11,
  color: "#e5e7eb",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-white/50">{title}</div>
      {children}
    </div>
  );
}
