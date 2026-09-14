import { createFileRoute } from "@tanstack/react-router";

type GeoJsonFeature = {
  id?: string;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown>;
};

type TornadoWarning = {
  id: string;
  title: string;
  severity: string;
  certainty: string;
  urgency: string;
  area: string;
  description: string;
  instruction: string | null;
  lat: number;
  lng: number;
  polygon: [number, number][];
  onset: string | null;
  expires: string | null;
  source: string;
};

export const Route = createFileRoute("/api/public/tornadoes")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const response = await fetch("https://api.weather.gov/alerts/active?event=Tornado%20Warning", {
            headers: {
              Accept: "application/geo+json",
              "User-Agent": "GeoOS environmental monitoring",
            },
          });
          if (!response.ok) {
            return Response.json({ warnings: [], error: `NOAA/NWS ${response.status}` }, { status: 502 });
          }
          const body = (await response.json()) as { features?: GeoJsonFeature[] };
          const warnings = (body.features ?? []).map(normalize).filter((item): item is TornadoWarning => item !== null);
          return Response.json(
            { warnings, source: "NOAA/NWS" },
            { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=180" } },
          );
        } catch (error) {
          return Response.json({ warnings: [], error: String(error) }, { status: 502 });
        }
      },
    },
  },
});

function normalize(feature: GeoJsonFeature): TornadoWarning | null {
  const properties = feature.properties ?? {};
  const ring = polygonRing(feature.geometry);
  const point = ring.length ? centroid(ring) : pointFromDescription(String(properties["description"] ?? ""));
  if (!point) return null;
  return {
    id: String(feature.id ?? properties["id"] ?? `${point.lat},${point.lng}`),
    title: String(properties["headline"] ?? properties["event"] ?? "Aviso de tornado"),
    severity: String(properties["severity"] ?? "Severe"),
    certainty: String(properties["certainty"] ?? "Observed"),
    urgency: String(properties["urgency"] ?? "Immediate"),
    area: String(properties["areaDesc"] ?? "Área sob aviso"),
    description: String(properties["description"] ?? "Aviso oficial de tornado ativo."),
    instruction: typeof properties["instruction"] === "string" ? properties["instruction"] : null,
    lat: point.lat,
    lng: point.lng,
    polygon: ring,
    onset: typeof properties["onset"] === "string" ? properties["onset"] : null,
    expires: typeof properties["expires"] === "string" ? properties["expires"] : null,
    source: String(properties["senderName"] ?? "NOAA/NWS"),
  };
}

function polygonRing(geometry: GeoJsonFeature["geometry"]): [number, number][] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  const coordinates = geometry.type === "MultiPolygon"
    ? geometry.coordinates[0]?.[0]
    : geometry.coordinates[0];
  if (!Array.isArray(coordinates)) return [];
  return coordinates.flatMap((pair) =>
    Array.isArray(pair) && Number.isFinite(Number(pair[0])) && Number.isFinite(Number(pair[1]))
      ? [[Number(pair[1]), Number(pair[0])] as [number, number]]
      : [],
  );
}

function centroid(ring: [number, number][]) {
  const sum = ring.reduce((acc, point) => ({ lat: acc.lat + point[0], lng: acc.lng + point[1] }), { lat: 0, lng: 0 });
  return { lat: sum.lat / ring.length, lng: sum.lng / ring.length };
}

function pointFromDescription(description: string) {
  const match = description.match(/LAT\.\.\.LON\s+([\d\s-]+)/i);
  if (!match) return null;
  const values = match[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
  if (values.length < 2) return null;
  const pairs: [number, number][] = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    pairs.push([values[index] / 100, -values[index + 1] / 100]);
  }
  return pairs.length ? centroid(pairs) : null;
}