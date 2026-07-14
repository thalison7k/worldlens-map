# GeoOS → GIS Enterprise (production-ready)

Escopo enorme. Vou executar em ondas curtas, cada uma entregando código funcional (não placeholder), mantendo o Event Bus como única forma de acoplamento. Confirme a ordem antes de começar — cada onda é 1 rodada de implementação + verificação.

## Princípios (aplicados em toda onda)
- MapKernel permanente; apps só conversam com ele via `bus`.
- Providers desacoplados em `src/lib/gis/providers/*` implementando um contrato comum (`fetch(bbox, timeframe)` + `subscribe?`).
- Cache em memória + `localStorage` com TTL; fallback silencioso para o gerador simulado quando a API falhar.
- Sem chaves no bundle: `import.meta.env.VITE_*` para chaves públicas de tiles; chaves privadas atrás de server functions.

## Onda 1 — Núcleo real do MapKernel + dados reais base
- Refatorar `MapKernel` para gerenciar N camadas via um `LayerController` (cada layer = provider + renderer + tick).
- Providers reais:
  - **USGS Earthquakes** (GeoJSON público, sem chave) → camada `earthquakes`.
  - **NASA FIRMS** (via endpoint público `firms/api/area/csv`, chave opcional via env) → camada `fires`.
  - **OpenStreetMap Nominatim** já usada em `geocoding.ts` — reconectar ao SearchEngine.
  - **Overpass API** → POIs (hospitais/escolas/delegacias) com bbox atual.
- Sincronizar bbox: quando o mapa mover (`moveend`), o kernel emite `map.bbox` e cada provider ativo refaz fetch com debounce.
- Cache: `src/lib/gis/cache.ts` (TTL + stale-while-revalidate).

## Onda 2 — Filters + Timeline + Search totalmente ligados
- TemporalEngine emite `timeline.change` → providers usam `timeframe` no fetch.
- Filters (categoria, severidade, cidade) emitem `filters.change` → LayerController filtra features.
- CommandPalette ⌘K: autocomplete Nominatim + resultados navegáveis; Enter dá `map.flyTo`.
- Popups reais com dados do provider (magnitude, hora, fonte).

## Onda 3 — Weather + AirQuality + Analysis Engine
- Providers **OpenWeather** (chave via `VITE_OPENWEATHER_KEY`, opcional) e **OpenAQ** (sem chave).
- Camadas: temperatura, chuva, vento (tile layers OWM) + heatmap AQI.
- AnalysisApp: ativar draw (`leaflet-draw` — instalar), medir distância/área, buffer via turf.js, exportar GeoJSON. Emite `analysis.result` para CommandCenter consumir.

## Onda 4 — IoT Provider + Realtime
- `src/lib/gis/iot/` com contrato `IoTProvider` e adaptadores stub para MQTT/WebSocket/Supabase Realtime/Firebase (estrutura ativa, ligável quando as credenciais existirem).
- Um adaptador WebSocket "demo" que gera sensores vivos localmente para provar o pipeline (não é placeholder — é fonte real substituível).
- Sensores viram camada com marker + popup + status/bateria/sinal.

## Onda 5 — CommandCenter dinâmico + PWA/perf/deploy
- CommandCenter consome providers (contagem de incêndios, terremotos 24h, AQI médio no bbox) via bus — nada fixo.
- PWA: `vite-plugin-pwa` com `generateSW`, NetworkFirst para HTML, ignora tiles cross-origin (remover `public/sw.js` atual e a skill kill-switch para migrar sem quebrar quem já instalou).
- Auditoria: `tsgo`, `eslint`, build, Lighthouse manual via Playwright.

## Detalhes técnicos
- Dependências novas: `@turf/turf`, `leaflet-draw` (+ tipos), `vite-plugin-pwa`. `mqtt` só na onda 4 se você confirmar.
- Chaves opcionais que valem pedir depois: `VITE_NASA_FIRMS_MAP_KEY`, `VITE_OPENWEATHER_KEY`. Sem elas, os providers caem para endpoints públicos/limitados ou para o gerador simulado.
- Nenhuma remoção de funcionalidade existente; apenas troca dos geradores por providers reais quando disponíveis.

## Ordem sugerida de execução
1. Onda 1 agora (base sólida, valor imediato: mapa com dados reais).
2. Onda 2 na sequência.
3. Ondas 3–5 conforme você validar cada anterior.

Confirma que começo pela **Onda 1** e me diz se quer que eu já provisione as chaves opcionais (FIRMS/OpenWeather) via `add_secret`, ou seguimos só com os endpoints públicos sem chave.
