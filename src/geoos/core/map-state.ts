import { bus } from "./bus";

/**
 * Snapshot vivo do estado do mapa.
 *
 * Apps abertos depois do carregamento (ex.: o Geo AI Assistant) perderiam os
 * eventos `map.bbox` / `map.layerBuilt` já emitidos. Este módulo escuta o bus
 * desde o boot e guarda o último estado conhecido para leitura imediata.
 */
export type MapSnapshot = {
  bbox: [number, number, number, number];
  center: { lat: number; lng: number };
  zoom: number;
  layers: Record<string, number>;
};

const snapshot: MapSnapshot = {
  bbox: [-180, -60, 180, 75],
  center: { lat: 0, lng: 0 },
  zoom: 3,
  layers: {},
};

bus.on("map.bbox", (b) => {
  snapshot.bbox = [b.west, b.south, b.east, b.north];
  snapshot.center = { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
  snapshot.zoom = b.zoom;
});

bus.on("map.layerBuilt", ({ layerId, count }) => {
  snapshot.layers[layerId] = count;
});

bus.on("map.toggleLayer", ({ layerId, visible }) => {
  if (visible === false) delete snapshot.layers[layerId];
});

/** Cópia imutável do último estado conhecido do mapa. */
export function getMapSnapshot(): MapSnapshot {
  return {
    bbox: [...snapshot.bbox] as MapSnapshot["bbox"],
    center: { ...snapshot.center },
    zoom: snapshot.zoom,
    layers: { ...snapshot.layers },
  };
}
