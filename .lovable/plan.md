# Plano de Evolução — GeoOS Environmental Pro

O escopo é enorme. Para entregar com qualidade (sem placeholders, sem botão morto, tudo com API real ou desativado), vou executar em **7 ondas incrementais**. Cada onda termina com build limpo e funcionalidades 100% operacionais antes da próxima.

## Onda 1 — Dashboard Ambiental + Status das APIs
- Novo app `DashboardApp` fixado por padrão ao lado do `LayersApp`.
- Cards: focos de incêndio (NASA FIRMS), terremotos 24h (USGS), AQI médio (OpenAQ), temperatura/vento/umidade médios (Open-Meteo — sem chave), alertas ativos, camadas carregadas, última atualização, status por API (online/offline + latência).
- Auto-refresh no intervalo global já existente (`layers.setRefreshInterval`).
- Skeleton loading e badges Online/Offline.

## Onda 2 — Camadas ambientais reais expandidas
- Adicionar providers reais: **NASA FIRMS** (focos, via proxy server-side com chave em secret), **Open-Meteo** (clima, vento, umidade, UV — sem chave), **GDACS** (alertas ativos), **NDVI** via tiles GIBS (NASA).
- Cada camada: opacidade, ordem, legenda dinâmica, contagem, última sync, cache SWR, atualização individual, indicador Online/Offline com tempo de resposta.
- Popups completos por camada (queimadas: potência, satélite, confiança, hora; terremotos: mag, prof, tipo, distância; AQI: PM2.5/PM10/CO/NO2/SO2/O3).

## Onda 3 — Ferramentas SIG no mapa
- Toolbar flutuante: medir distância, medir área, coordenadas do cursor, coordenadas do clique, copiar coordenadas, escala dinâmica, mini-mapa, bússola, tela cheia, imprimir, exportar PNG/GeoJSON/CSV/KML da vista atual.
- Usar `leaflet-measure`, `leaflet-minimap`, `leaflet-easyprint` (ou implementação leve própria).

## Onda 4 — Filtros avançados + Busca global
- Painel de filtros: país, estado, cidade, raio, data, magnitude, temperatura, faixa AQI, categoria, intensidade. Emitidos via `filters.change`.
- Busca global (⌘K já existe) integrada a Nominatim para cidade/país/estado/parque/coordenadas com fly-to.

## Onda 5 — Timeline profissional + Analytics
- Timeline com play/pause, velocidade (0.5x/1x/2x/4x), seleção de intervalo, comparar 2 datas (split), animação suave via `requestAnimationFrame`.
- App **Analytics**: gráficos (Recharts) — queimadas/dia, terremotos por magnitude, AQI por cidade, temperatura, vento, ocorrências por país. Reativo aos dados carregados.

## Onda 6 — Relatórios + IA + PWA polish
- Geração de relatório PDF (jsPDF) com resumo executivo, mapa (canvas), gráficos, tabela e filtros aplicados. Exportar CSV/GeoJSON.
- **Geo AI Assistant** via Lovable AI Gateway (`google/gemini-3.6-flash`) — chat com contexto do bbox/camadas ativas: explica dados, gera resumo, sugere análises.
- PWA: revisar manifest, splash screens, ícones maskable, cache inteligente (network-first para APIs, cache-first para tiles), auto-update.

## Onda 7 — Performance, qualidade e auditoria final
- Virtualização de listas grandes, debounce/throttle nos eventos do mapa, AbortController em todas as fetches, memoização com `useMemo`/`React.memo`, cluster otimizado.
- Auditoria: `bun run build`, `tsgo`, checar console/network, testar responsividade mobile/tablet/desktop, validar PWA no Lighthouse.

## Referência da imagem (MSN Weather)
Vou replicar a barra de ícones climáticos no topo do mapa (temperatura, chuva, radar, vento, nuvens, umidade, visibilidade, pressão, tempestades, neve, alertas, raios) como **toggles de camadas rápidas**, e a barra inferior com Hoje/Amanhã/Mais tarde ligada à timeline.

## Detalhes técnicos
- Novos providers em `src/lib/gis/providers/` (firms.ts, openmeteo.ts, gdacs.ts, gibs.ts).
- Proxies server-side em `src/routes/api/public/` para APIs com CORS ou chave (FIRMS).
- Secret `FIRMS_MAP_KEY` via `secrets--add_secret` (grátis em firms.modaps.eosdis.nasa.gov).
- Novos apps em `src/geoos/apps/`: DashboardApp, AnalyticsApp, ReportsApp, AIAssistantApp, FiltersApp.
- Toolbar SIG em `src/geoos/desktop/MapToolbar.tsx`.
- Barra de camadas rápidas estilo MSN em `src/geoos/desktop/QuickLayersBar.tsx`.
- Store estende `zustand` com `apiStatus`, `filters`, `timelineState`.

## Confirmações necessárias antes de começar
1. Posso solicitar a chave gratuita **NASA FIRMS** como secret (`FIRMS_MAP_KEY`)? Sem ela, camada de queimadas fica desativada com aviso — não com dados fake.
2. Confirmar uso do **Lovable AI Gateway** para o Geo AI Assistant (gratuito com créditos do workspace).
3. Começo pela **Onda 1 (Dashboard + Status APIs)** e sigo em sequência, ou você quer priorizar outra onda primeiro?