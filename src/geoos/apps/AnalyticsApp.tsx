import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBus } from "@/geoos/core/useBus";
import { fetchEarthquakes, magColor, type Quake } from "@/lib/gis/providers/usgs";
import { fetchAirStations, type AirStation } from "@/lib/gis/providers/openaq";
import { fetchWeather, type WeatherPoint } from "@/lib/gis/providers/openmeteo";
import { fetchFires, type FirePoint } from "@/lib/gis/providers/firms";
import type { BBox } from "@/lib/gis/simulated";

/**
 * AnalyticsApp — visualizações em tempo real dos dados carregados.
 * Reage ao bbox do mapa para focar as análises na área observada.
 */
export default function AnalyticsApp() {
  const [bbox, setBbox] = useState<BBox>([-90, -60, 90, 60]);
  const [quakes, setQuakes] = useState<Quake[]>([]);
  const [air, setAir] = useState<AirStation[]>([]);
  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [fires, setFires] = useState<FirePoint[]>([]);

  useBus("map.bbox", (b) => setBbox([b.west, b.south, b.east, b.north]));

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchEarthquakes("day"),
      fetchAirStations(bbox, 100),
      fetchWeather(bbox, 24),
      fetchFires(bbox, 1),
    ]).then(([q, a, w, f]) => {
      if (!alive) return;
      setQuakes(q); setAir(a); setWeather(w); setFires(f);
    });
    return () => { alive = false; };
  }, [bbox.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 text-white">
      <ChartCard title={`Terremotos por magnitude · ${quakes.length} total`}>
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
