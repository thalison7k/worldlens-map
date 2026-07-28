import { supabase } from "@/integrations/supabase/client";
import { bus } from "@/geoos/core/bus";
import type { DeviceSnapshot } from "./device";

export type SensorReading = {
  id: string;
  device_id: string;
  device_label: string | null;
  device_kind: string;
  platform: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  network_type: string | null;
  downlink_mbps: number | null;
  battery_pct: number | null;
  temperature_c: number | null;
  air_pm25: number | null;
  note: string | null;
  created_at: string;
};

/** Temperatura real do ponto (Open-Meteo) — nunca valor sintético. */
async function currentTemperature(lat: number, lng: number): Promise<number | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as { current?: { temperature_2m?: number } };
    return typeof j.current?.temperature_2m === "number" ? j.current.temperature_2m : null;
  } catch {
    return null;
  }
}

export async function publishReading(
  snap: DeviceSnapshot,
  note?: string,
): Promise<SensorReading> {
  if (snap.lat == null || snap.lng == null) {
    throw new Error("Sem localização: autorize o acesso ao GPS do dispositivo.");
  }
  const temperature = await currentTemperature(snap.lat, snap.lng);
  const { data, error } = await supabase
    .from("sensor_readings")
    .insert({
      device_id: snap.deviceId,
      device_label: snap.label ? snap.label.slice(0, 40) : null,
      device_kind: snap.kind,
      platform: snap.platform,
      lat: snap.lat,
      lng: snap.lng,
      accuracy_m: snap.accuracyM,
      network_type: snap.network.type,
      downlink_mbps: snap.network.downlinkMbps,
      battery_pct: snap.batteryPct,
      temperature_c: temperature,
      note: note?.slice(0, 160) || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SensorReading;
}

export async function fetchReadings(limit = 300): Promise<SensorReading[]> {
  const started = performance.now();
  const { data, error } = await supabase
    .from("sensor_readings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  bus.emit("api.status", {
    id: "cloud-iot",
    label: "Sensores IoT (nuvem)",
    ok: !error,
    latencyMs: Math.round(performance.now() - started),
    ts: Date.now(),
    count: data?.length ?? 0,
    error: error?.message,
  });

  if (error) return [];
  return (data ?? []) as SensorReading[];
}

/** Assinatura realtime — devolve a função de cancelamento. */
export function subscribeReadings(onInsert: (r: SensorReading) => void): () => void {
  const channel = supabase
    .channel("sensor_readings_live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "sensor_readings" },
      (payload) => onInsert(payload.new as SensorReading),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
