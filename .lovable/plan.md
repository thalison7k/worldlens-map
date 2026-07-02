# Plano — Módulo "Mapa Global (World GIS)"

O escopo enviado é enorme (GIS mundial, múltiplos provedores, camadas ambientais, timeline, ISA com IA). Vou entregar em **fases**, começando por uma base sólida e navegável, com **arquitetura desacoplada** para plugar provedores/fontes depois sem reescrever nada.

Antes de começar, preciso confirmar 3 pontos rápidos — respostas mudam bastante o esforço:

1. **Escopo desta primeira entrega**: implemento a **Fase 1 completa** (mapa mundial navegável + camadas base + busca + geolocalização + mini-mapa/escala/coordenadas + estrutura de camadas temáticas com dados mock) e deixo Fases 2–4 como stubs prontos para plugar? Ou você quer que eu já ative alguma integração real específica agora (ex.: OpenWeather, NASA FIRMS para queimadas, INPE)?
2. **Provedor de tiles**: começo apenas com **OSM + camadas gratuitas** (OSM padrão, CartoDB Light/Dark, Esri World Imagery para "satélite", OpenTopoMap para "terreno") — sem custo, sem chave? Mapbox/Google ficam como adaptadores prontos para você habilitar quando tiver chaves.
3. **Ocorrências / ISA**: nesta fase uso **dados mock realistas** (gerados por região visível) para demonstrar HeatMap, clusters, timeline e o índice ISA 0–100? Quando você tiver o backend/fontes reais, trocamos a fonte sem mudar UI.

---

## Arquitetura

- **Stack de mapa**: `react-leaflet` + `leaflet` (OSM nativo, gratuito, sem chave). Plugins: `leaflet.markercluster` (clusters), `leaflet.heat` (heatmap), `leaflet-minimap`, `leaflet-rotate` (rotação), `leaflet-control-geocoder` (busca Nominatim).
- **Camada de abstração de provedores** (`src/lib/gis/providers/`): interface `TileProvider` com implementações `osm`, `cartoLight`, `cartoDark`, `esriSatellite`, `openTopo`, stubs `mapbox`, `google`. Trocar provedor = trocar 1 linha.
- **Camada de dados** (`src/lib/gis/sources/`): interface `DataSource<T>` (queimadas, chuvas, enchentes, sensores, ocorrências…). Implementação inicial `mockSource`; adaptadores vazios para OpenWeather, NASA FIRMS, INPE, IBGE, CEMADEN, Sentinel — só preencher a função `fetch()`.
- **Geocoding** (`src/lib/gis/geocoding.ts`): Nominatim (OSM) para busca mundial + reverse geocoding. Adaptador plugável para Google/Mapbox depois. Busca por CEP via ViaCEP quando input casar com padrão brasileiro.
- **ISA** (`src/lib/gis/isa.ts`): função pura que recebe agregados por região e devolve `{score 0-100, classification, trend, breakdown, explanation}`. Explicação textual gerada localmente na Fase 1; troca para Lovable AI Gateway na Fase 3.

## Fase 1 — o que entrego agora

**Rotas**

- `/map` — tela principal do GIS (rota nova, adicionada ao __root com metadata SEO própria).

**UI (componentes em `src/components/gis/`)**

- `WorldMap` — container react-leaflet, zoom infinito, arrasto, rotação, geolocalização automática com fallback global.
- `BaseLayerSwitcher` — Light / Dark / Satélite / Terreno / Híbrida / Rua.
- `LayerPanel` — toggles individuais para as 17 camadas listadas (as sem fonte real ainda mostram badge "mock"/"em breve" mas já renderizam a estrutura).
- `SearchBar` — busca unificada: endereço, CEP, bairro, cidade, estado, país, coordenadas (`-23.55, -46.63`). Detecta o tipo do input.
- `LocationPanel` — cidade/estado/país/bairro/CEP/lat/lng/altitude/timezone/precisão do GPS ao vivo.
- `Coordinates` + `ScaleBar` + `Compass` + `MiniMap` — HUD do mapa.
- `Timeline` — slider temporal (hoje / 7d / 30d / 12m / comparação) que filtra as camadas dinâmicas.
- `IsaPanel` — mostra ISA da região visível: nota, classificação, tendência, top-3 fatores, sugestões.
- `HeatmapLayer` + `ClusterLayer` — recebem qualquer `DataSource`.

**Design system**

- Tokens novos em `src/styles.css` para tema GIS (dark-first, verde/âmbar/vermelho para ISA, contraste alto sobre imagery). Sem cores hardcoded em componentes.

**SEO / meta**

- `/map` com `head()` próprio (title, description, og). `robots.txt` + `sitemap.xml` incluídos.

## Fases seguintes (fora desta entrega, arquitetura já pronta)

- **Fase 2** — plugar fontes reais gratuitas: NASA FIRMS (queimadas), OpenWeather (chuva/ar), USGS (sismos), IBGE (limites administrativos + código IBGE no reverse geocoding).
- **Fase 3** — ISA com IA (Lovable AI Gateway) gerando explicação e sugestões por região; persistência de histórico no Lovable Cloud.
- **Fase 4** — Mapbox / Google Maps (chaves do usuário), Sentinel-2, CEMADEN, sensores IoT, drones.

## Dependências novas

`leaflet`, `react-leaflet`, `@types/leaflet`, `leaflet.markercluster`, `@types/leaflet.markercluster`, `leaflet.heat`, `leaflet-minimap`, `leaflet-rotate`, `leaflet-control-geocoder`.

---

Confirma as 3 perguntas acima (ou responde "toca o padrão") e eu executo a Fase 1 inteira de uma vez.