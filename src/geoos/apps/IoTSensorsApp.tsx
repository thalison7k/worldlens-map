import { useCallback, useEffect, useRef, useState } from "react";
import { Battery, Crosshair, Loader2, RefreshCw, Send, Signal, Smartphone } from "lucide-react";
import { bus } from "@/geoos/core/bus";
import {
  getDeviceKind, getDeviceLabel, getNetworkInfo, readDevice, setDeviceLabel,
  type DeviceSnapshot,
} from "@/lib/iot/device";
import { fetchReadings, publishReading, subscribeReadings, type SensorReading } from "@/lib/iot/cloud";

/**
 * IoT / Sensores — coleta os sensores do próprio dispositivo (GPS, rede sem fio,
 * bateria) e publica no banco de dados na nuvem. Todas as leituras chegam em
 * tempo real a todos os painéis abertos, em qualquer plataforma.
 */
export default function IoTSensorsApp() {
  const [snap, setSnap] = useState<DeviceSnapshot | null>(null);
  const [label, setLabel] = useState(() => getDeviceLabel());
  const [note, setNote] = useState("");
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [rows, setRows] = useState<SensorReading[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async () => {
    const list = await fetchReadings(60);
    if (mounted.current) setRows(list);
  }, []);

  useEffect(() => {
    void refresh();
    const off = subscribeReadings((r) => {
      if (!mounted.current) return;
      setRows((prev) => [r, ...prev].slice(0, 60));
    });
    return off;
  }, [refresh]);

  const scan = useCallback(async () => {
    setReading(true);
    setErr(null);
    try {
      const s = await readDevice();
      if (!mounted.current) return;
      setSnap(s);
      if (s.lat != null && s.lng != null) {
        bus.emit("map.flyTo", { lat: s.lat, lng: s.lng, zoom: 11 });
      } else {
        setErr("Sem localização. Autorize o GPS para publicar leituras.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setReading(false);
    }
  }, []);

  const publish = useCallback(async () => {
    if (!snap) return;
    setSending(true);
    setErr(null);
    try {
      setDeviceLabel(label);
      await publishReading({ ...snap, label }, note);
      setNote("");
      bus.emit("notify", { title: "Leitura publicada", message: "Enviada ao banco de dados na nuvem.", level: "success" });
      bus.emit("map.refreshLayer", { layerId: "iot_sensors" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setSending(false);
    }
  }, [snap, label, note]);

  const net = snap?.network ?? getNetworkInfo();

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs text-white/80">
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Smartphone className="h-4 w-4 shrink-0 text-sky-400" />
            <span className="truncate font-semibold text-white">Meu dispositivo</span>
          </div>
          <button
            onClick={() => void scan()}
            disabled={reading}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-400/15 px-2 text-[11px] font-medium text-white hover:bg-sky-400/25 disabled:opacity-50"
          >
            {reading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
            Ler sensores
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Plataforma" value={snap?.platform ?? "—"} />
          <Stat label="Perfil" value={snap?.kind ?? getDeviceKind()} />
          <Stat label="Rede sem fio" value={net.type ?? "n/d"} icon={<Signal className="h-3 w-3" />} />
          <Stat label="Banda" value={net.downlinkMbps != null ? `${net.downlinkMbps} Mbps` : "n/d"} />
          <Stat label="Bateria" value={snap?.batteryPct != null ? `${snap.batteryPct}%` : "n/d"} icon={<Battery className="h-3 w-3" />} />
          <Stat label="Precisão GPS" value={snap?.accuracyM != null ? `± ${Math.round(snap.accuracyM)} m` : "n/d"} />
          <div className="col-span-2">
            <Stat
              label="Coordenadas"
              value={snap?.lat != null && snap?.lng != null ? `${snap.lat.toFixed(5)}, ${snap.lng.toFixed(5)}` : "—"}
            />
          </div>
        </dl>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 40))}
          placeholder="Apelido do dispositivo (ex.: Sensor Zona Sul)"
          className="mt-3 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-sky-400/50"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 160))}
          placeholder="Observação ambiental (opcional)"
          className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-sky-400/50"
        />
        <button
          onClick={() => void publish()}
          disabled={!snap || snap.lat == null || sending}
          className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-400/15 text-[11px] font-medium text-white hover:bg-emerald-400/25 disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Publicar na nuvem
        </button>
        {err && <p className="mt-2 text-[11px] text-rose-300">{err}</p>}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="truncate font-semibold text-white">Rede de sensores · tempo real</span>
          <button
            onClick={() => void refresh()}
            title="Atualizar"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-white/40">{rows.length} leituras armazenadas na nuvem</p>
        <ul className="mt-2 space-y-1.5">
          {rows.length === 0 && <li className="text-[11px] text-white/40">Nenhuma leitura ainda. Publique a primeira.</li>}
          {rows.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => bus.emit("map.flyTo", { lat: r.lat, lng: r.lng, zoom: 12 })}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left hover:bg-white/[0.06]"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="truncate text-[11px] font-medium text-white">
                    {r.device_label || "Dispositivo anônimo"}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-white/40">
                    {new Date(r.created_at).toLocaleTimeString("pt-BR")}
                  </span>
                </div>
                <div className="truncate text-[10px] text-white/50">
                  {r.device_kind} · {r.network_type ?? "rede n/d"} ·{" "}
                  {r.temperature_c != null ? `${r.temperature_c.toFixed(1)}°C` : "temp n/d"} ·{" "}
                  {r.lat.toFixed(2)}, {r.lng.toFixed(2)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/40">
        {icon}
        {label}
      </div>
      <div className="truncate text-[11px] font-medium text-white/90">{value}</div>
    </div>
  );
}
