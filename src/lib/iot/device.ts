/**
 * Camada de aquisição de sensores do dispositivo (computação ubíqua/móvel).
 * Usa apenas Web APIs padrão — funciona em Android, iOS, tablet e desktop,
 * o que mantém a aplicação multiplataforma sem código nativo.
 */

const DEVICE_ID_KEY = "geoos.device.id";
const DEVICE_LABEL_KEY = "geoos.device.label";

export type DeviceKind = "smartphone" | "tablet" | "desktop";

export type NetworkInfo = {
  type: string | null;
  downlinkMbps: number | null;
};

export type DeviceSnapshot = {
  deviceId: string;
  label: string;
  kind: DeviceKind;
  platform: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  network: NetworkInfo;
  batteryPct: number | null;
};

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server-render0";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id || id.length < 6) {
    id = randomId();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceLabel(): string {
  if (typeof window === "undefined") return "Dispositivo";
  return localStorage.getItem(DEVICE_LABEL_KEY) ?? "";
}

export function setDeviceLabel(label: string) {
  localStorage.setItem(DEVICE_LABEL_KEY, label.slice(0, 40));
}

export function getDeviceKind(): DeviceKind {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "smartphone";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (coarse && window.innerWidth >= 768) return "tablet";
  if (coarse) return "smartphone";
  return "desktop";
}

export function getPlatform(): string {
  if (typeof navigator === "undefined") return "-";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform ?? navigator.platform ?? "web";
}

/** Rede sem fio: Network Information API (Chromium/Android). */
export function getNetworkInfo(): NetworkInfo {
  if (typeof navigator === "undefined") return { type: null, downlinkMbps: null };
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string; downlink?: number };
  };
  const c = nav.connection;
  if (!c) return { type: null, downlinkMbps: null };
  return {
    type: c.type && c.type !== "unknown" ? c.type : (c.effectiveType ?? null),
    downlinkMbps: typeof c.downlink === "number" ? c.downlink : null,
  };
}

export async function getBatteryPct(): Promise<number | null> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number }>;
  };
  if (!nav.getBattery) return null;
  try {
    const b = await nav.getBattery();
    return Math.round(b.level * 100);
  } catch {
    return null;
  }
}

/** Aplicação sensível à localização — GPS/WiFi positioning do próprio device. */
export function getPosition(timeoutMs = 12_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocalização não suportada neste dispositivo"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 30_000,
    });
  });
}

export async function readDevice(): Promise<DeviceSnapshot> {
  const [battery, pos] = await Promise.all([
    getBatteryPct(),
    getPosition().catch(() => null),
  ]);
  return {
    deviceId: getDeviceId(),
    label: getDeviceLabel(),
    kind: getDeviceKind(),
    platform: getPlatform(),
    lat: pos?.coords.latitude ?? null,
    lng: pos?.coords.longitude ?? null,
    accuracyM: pos?.coords.accuracy ?? null,
    network: getNetworkInfo(),
    batteryPct: battery,
  };
}
