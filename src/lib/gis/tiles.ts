import L from "leaflet";

/**
 * Camadas de tiles "seguras".
 *
 * Provedores como NASA GIBS, RainViewer, OpenTopoMap e Esri só publicam tiles
 * até um determinado nível de zoom nativo. Quando o Leaflet pede um nível
 * acima disso o servidor devolve uma imagem de erro (ex.: "Zoom Level Not
 * Supported") ou HTTP 404 — e o usuário vê o erro estampado sobre o mapa.
 *
 * A regra correta é sempre:
 *   maxNativeZoom = último nível realmente publicado pelo provedor
 *   maxZoom       = zoom máximo do mapa (o Leaflet reamostra/upscale sozinho)
 *
 * Além disso trocamos qualquer tile com falha por um PNG 1x1 transparente
 * (`errorTileUrl`) e escondemos o tile no evento `tileerror`, garantindo que
 * nenhuma mensagem do provedor apareça na tela.
 */

/** PNG 1x1 totalmente transparente — usado no lugar de qualquer tile inválido. */
export const TRANSPARENT_TILE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Zoom máximo do mapa (todas as camadas fazem upscaling acima do nativo). */
export const MAP_MAX_ZOOM = 22;

export interface SafeTileOptions extends L.TileLayerOptions {
  /** Último nível de zoom publicado pelo provedor. Obrigatório. */
  maxNativeZoom: number;
}

export function safeTileLayer(url: string, opts: SafeTileOptions): L.TileLayer {
  const layer = L.tileLayer(url, {
    // O mapa pode ir até MAP_MAX_ZOOM; acima do nativo o Leaflet faz upscaling.
    maxZoom: MAP_MAX_ZOOM,
    minZoom: 0,
    // Nunca deixa o navegador exibir a imagem de erro do provedor.
    errorTileUrl: TRANSPARENT_TILE,
    // `crossOrigin` só é necessário para provedores que enviam CORS. Alguns
    // (RainViewer) não enviam `Access-Control-Allow-Origin` e o tile seria
    // bloqueado pelo navegador; nesses casos o opt-in fica com a camada.
    crossOrigin: false,
    noWrap: false,
    ...opts,
  });

  // Defesa extra: alguns provedores devolvem HTTP 200 com uma imagem de erro.
  // Nesse caso o `error` não dispara, mas o `tileerror` dispara em 404/timeout.
  layer.on("tileerror", (e: L.TileErrorEvent) => {
    const tile = e.tile as HTMLImageElement | undefined;
    if (tile) {
      tile.style.visibility = "hidden";
      tile.src = TRANSPARENT_TILE;
    }
  });

  return layer;
}
