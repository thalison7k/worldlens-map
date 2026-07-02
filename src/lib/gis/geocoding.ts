import type { LatLng } from "./types";

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
  address: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
    postcode?: string;
  };
  boundingbox?: [number, number, number, number];
};

const NOMINATIM = "https://nominatim.openstreetmap.org";
const VIACEP = "https://viacep.com.br/ws";

const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\s*$/;
const CEP_RE = /^\s*(\d{5})-?(\d{3})\s*$/;

export function parseCoordinates(input: string): LatLng | null {
  const m = input.match(COORD_RE);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  const cep = query.match(CEP_RE);
  if (cep) {
    const cepStr = `${cep[1]}${cep[2]}`;
    try {
      const r = await fetch(`${VIACEP}/${cepStr}/json/`);
      const data = await r.json();
      if (!data.erro) {
        const q = `${data.logradouro || ""} ${data.bairro || ""} ${data.localidade || ""} ${data.uf || ""} Brasil`.trim();
        const nom = await fetch(
          `${NOMINATIM}/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`,
          { headers: { Accept: "application/json" } },
        );
        const arr = (await nom.json()) as NominatimHit[];
        if (arr[0]) return arr.map(normalize);
      }
    } catch { /* fall through */ }
  }
  const r = await fetch(
    `${NOMINATIM}/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json" } },
  );
  const arr = (await r.json()) as NominatimHit[];
  return arr.map(normalize);
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  try {
    const r = await fetch(
      `${NOMINATIM}/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } },
    );
    const data = (await r.json()) as NominatimHit;
    if (!data || !data.lat) return null;
    return normalize(data);
  } catch {
    return null;
  }
}

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
  address: GeocodeResult["address"];
  boundingbox?: [string, string, string, string];
};

function normalize(h: NominatimHit): GeocodeResult {
  return {
    lat: parseFloat(h.lat),
    lng: parseFloat(h.lon),
    displayName: h.display_name,
    address: h.address ?? {},
    boundingbox: h.boundingbox
      ? [parseFloat(h.boundingbox[0]), parseFloat(h.boundingbox[1]), parseFloat(h.boundingbox[2]), parseFloat(h.boundingbox[3])]
      : undefined,
  };
}
