# GeoOS — World Atlas Live

**Projeto Integrador VI — Univesp**
Curso de Engenharia de Computação

Plataforma web de **monitoramento ambiental global em tempo real**,
construída como GIS Enterprise leve, executando 100% no navegador
com dados abertos de agências oficiais (USGS, OpenAQ, NOAA). O sistema
é entregue como PWA instalável em desktop e mobile.

URL de produção: <https://worldlens-map.lovable.app>

---

## 1. Identidade do projeto

- **Curso:** Engenharia de Computação — Univesp
- **Disciplina:** Projeto Integrador VI
- **Tema:** Sistema de apoio à decisão em monitoramento ambiental
  utilizando dados abertos e arquitetura orientada a eventos.
- **Escopo funcional:** visualizar, em uma única tela, indicadores
  ambientais globais (sismicidade, qualidade do ar, ENSO / El Niño –
  La Niña), com atualização automática e sem dependência de dados
  simulados.

---

## 2. Objetivos

1. Disponibilizar um painel único, geoespacial, com camadas
   ambientais reais.
2. Aplicar conceitos de engenharia de software: arquitetura
   desacoplada (Event Bus), cache com *stale-while-revalidate*,
   proxies server-side para contornar CORS, PWA.
3. Servir de base didática — cada módulo tem uma única
   responsabilidade e comunica-se apenas por eventos tipados.

---

## 3. Arquitetura geral

```text
┌──────────────────────────────────────────────────────────────┐
│                        Navegador (PWA)                       │
│                                                              │
│  ┌────────────┐   emit / on    ┌──────────────────────────┐  │
│  │ LayersApp  │◀──────────────▶│      Event Bus (mitt)    │  │
│  │  (única    │                │  map.* · timeline.* ·    │  │
│  │  janela)   │                │  filters.* · theme.*     │  │
│  └────────────┘                └──────────┬───────────────┘  │
│         ▲                                 │                  │
│         │ counts / KPIs                   ▼                  │
│  ┌────────────┐            ┌──────────────────────────────┐  │
│  │  Providers │◀───SWR────▶│         MapKernel            │  │
│  │  USGS ·    │            │  (Leaflet, sempre montado)   │  │
│  │  OpenAQ ·  │            │  build/dispose de camadas    │  │
│  │  NOAA ONI  │            └──────────────────────────────┘  │
│  └─────┬──────┘                                              │
│        │ fetch                                               │
└────────┼─────────────────────────────────────────────────────┘
         ▼
  ┌──────────────────────────────────────────────────────────┐
  │   Server routes TanStack Start (Cloudflare Workers)      │
  │   /api/public/openaq   ← proxy CORS + cache              │
  │   /api/public/enso     ← parse NOAA CPC (texto ASCII)    │
  └──────────────────────────────────────────────────────────┘
                              │
                              ▼
        USGS · OpenAQ v3 · NOAA CPC (ONI) — APIs públicas
```

### 3.1 Núcleo (`src/geoos/core`)

| Módulo | Responsabilidade |
| --- | --- |
| `bus.ts` | Event Bus tipado (mitt) — todos os canais do sistema |
| `useBus.ts` | Hook React para assinar canais com cleanup automático |
| `store.ts` | Estado global (Zustand): janelas, workspace, tema |
| `theme.ts` | Aplica variantes visuais + emite `map.setBase` |

**Canais principais**

- `map.flyTo`, `map.setBase`, `map.toggleLayer`, `map.setOpacity`
- `map.bbox`, `map.layerBuilt` (telemetria de renderização)
- `timeline.change`, `filters.change`, `theme.change`
- `search.query`, `notify`, `palette.open`

### 3.2 Desktop shell (`src/geoos/desktop`)

- `Desktop.tsx` — orquestrador; monta MapKernel + LayersApp e
  registra o service worker apenas em produção.
- `MapKernel.tsx` — instância única do Leaflet, sempre no fundo.
  Constrói/destrói camadas sob demanda a partir do bus, sem re-mount.
- `Topbar.tsx` — busca global, seletor de tema, botão "Instalar app".

### 3.3 Módulos (apps) — `src/geoos/apps/*`

Todos são janelas flutuantes independentes, registradas em
`registry.tsx` e abertas pelo Dock ou pelo ⌘K:

| App | Função |
| --- | --- |
| **Alertas** | Ciclones tropicais, focos de calor, sismos e ar — risco em tempo real. |
| **Dashboard** | Visão executiva com KPIs ambientais da área visível. |
| **Camadas** | Toggle independente por camada, KPIs ao vivo, card ENSO, atalho "último sismo", auto-refresh configurável. |
| **Analytics** | Gráficos (Recharts) da região visível. |
| **Time Machine** | Reconstrói e anima o histórico ambiental; ativa o **modo globo 3D**. |
| **Sensores IoT** | Telemetria do dispositivo (GPS, rede, bateria) publicada na nuvem. |
| **Geo AI** | Assistente contextual (Lovable AI) que recebe bbox, zoom, camadas e dados carregados. |

### 3.4 Providers (`src/lib/gis/providers/*`)

Cada provider é uma função pura `() => Promise<T>` envolvida por
`swr(key, ttl, fetcher)` (`src/lib/gis/cache.ts`) — cache em memória
+ `localStorage` com fallback *stale-any* quando a rede falha.

| Provider | Fonte | TTL | Observações |
| --- | --- | --- | --- |
| `usgs.ts` | USGS GeoJSON summary feed | 5 min | CORS liberado, uso direto |
| `openaq.ts` | OpenAQ v3 `/locations` | 10 min | via proxy `/api/public/openaq` |
| `enso.ts` | NOAA CPC / PSL (Niño 3.4) | 60 min | via proxy `/api/public/enso` |
| `firms.ts` | NASA FIRMS / INPE (focos de calor) | 10 min | via proxy `/api/public/firms` |
| `cyclones.ts` | NOAA NHC + GDACS/JTWC (global) | 15 min | via proxy `/api/public/cyclones` |
| `openmeteo.ts` | Open-Meteo (clima e qualidade do ar) | 10 min | requisições agrupadas por lote |
| `history.ts` | ERA5 / NASA GIBS (série histórica) | 60 min | base da Time Machine |


### 3.5 Camadas (`src/lib/gis/real-layers.ts`)

Cada `LayerDef` expõe `build(ctx) → BuiltLayer` com
`layer / setOpacity / dispose`. Camadas assíncronas devolvem o
grupo Leaflet imediatamente e populam depois — o mapa nunca trava
esperando rede.

- **Terremotos (USGS, 24h)** — `CircleMarker` cujo raio e cor
  variam com a magnitude.
- **Qualidade do ar (OpenAQ)** — camada BBox-driven: recarrega
  quando o viewport muda (`BBOX_DRIVEN_LAYERS`).
- **El Niño / La Niña (NOAA ONI)** — retângulo sobre a região
  Niño 3.4 (5°S–5°N, 170°W–120°W) colorido pela fase atual.

### 3.6 Rotas server (`src/routes/api/public/*`)

TanStack Start server routes que executam em Cloudflare Workers:

- Contornam CORS (APIs públicas que não expõem `Access-Control-*`).
- Adicionam `cache-control: public, max-age=…, stale-while-revalidate=…`.
- Degradam graciosamente: se a fonte falhar, devolvem
  `{ results: [] }` / `{ latest: null, phase: "unknown" }` em
  vez de erro, mantendo o console limpo.

---

## 4. Fluxo de dados (exemplo: sismo aparece no mapa)

1. Usuário liga "Terremotos (USGS)" em `LayersApp`.
2. `LayersApp` emite `map.toggleLayer { layerId, visible: true }`.
3. `MapKernel` executa `buildLayer(id)` → chama `def.build(ctx)`.
4. `build` chama `fetchEarthquakes()` → `swr()` verifica cache;
   se expirado, faz `fetch()` direto ao USGS.
5. Ao resolver, os `CircleMarker` entram no `LayerGroup` já
   presente no mapa; `map.layerBuilt { count }` é emitido.
6. `LayersApp` recebe o `count`, atualiza KPIs "Pontos no mapa"
   e "Sismo máx. 24h" — **sem import direto do MapKernel**.

---

## 5. Stack técnica

- **Framework:** TanStack Start v1 (React 19, Vite 7, SSR em
  Cloudflare Workers).
- **Estilo:** Tailwind CSS v4 + tokens semânticos em `styles.css`.
- **Mapa:** Leaflet + leaflet.markercluster (canvas renderer).
- **Estado:** Zustand (UI) + Event Bus (comunicação entre módulos).
- **Cache:** in-memory `Map` + `localStorage` com SWR próprio.
- **PWA:** `public/manifest.webmanifest` + `public/sw.js`
  (network-first para HTML, cache-first para assets hashed).
  Service Worker registra somente em produção — nunca no preview.

---

## 6. Executando localmente

```bash
bun install
bun run dev
# abre http://localhost:8080
```

Sem chaves obrigatórias. Chave opcional:

- `OPENAQ_API_KEY` — melhora limites do proxy OpenAQ (definir
  como secret do projeto; o proxy encaminha via `X-API-Key`).

---

## 7. Estrutura de pastas relevante

```text
src/
├── geoos/
│   ├── core/          # bus, store, tema — o "kernel"
│   ├── desktop/       # shell (MapKernel, Topbar, Desktop)
│   └── apps/
│       └── LayersApp.tsx   # único módulo funcional
├── lib/gis/
│   ├── cache.ts       # SWR + persistência
│   ├── layer-defs.ts  # contratos LayerDef / BuiltLayer
│   ├── real-layers.ts # camadas ambientais reais
│   └── providers/     # USGS · OpenAQ · NOAA ENSO
└── routes/
    ├── __root.tsx     # head/metadata, providers
    ├── index.tsx      # entrypoint → Desktop
    └── api/public/    # proxies CORS
```

---

## 8. Decisões de projeto

- **Foco ambiental estrito:** módulos urbanos (transporte,
  segurança, POIs) foram removidos para garantir consistência dos
  dados e desempenho previsível.
- **Zero dados aleatórios:** qualquer camada sem fonte pública
  disponível fica desligada por padrão — não há marcadores
  fictícios em produção.
- **Event Bus como contrato:** nenhum app importa outro
  diretamente. Isso permite adicionar novas camadas ou substituir
  o MapKernel sem tocar o LayersApp.
- **Cache SWR:** garante fluidez mesmo em conexões instáveis e
  reduz pressão sobre APIs públicas gratuitas.
- **PWA:** instalável, com ícone próprio; ideal para uso em
  campo (tablets/celulares) em cenários de defesa civil.

---

---

## 9. Perguntas de banca (respostas diretas)

### 10.1 Onde está o banco de dados em nuvem?

Em um **Postgres gerenciado na nuvem (Lovable Cloud / Supabase)**, provisionado
pelo próprio projeto — não há banco local nem arquivo embarcado. A tabela de
telemetria é:

```sql
public.sensor_readings (
  id uuid pk, device_id text, device_label text, device_kind text,
  platform text, lat double precision, lng double precision,
  accuracy_m, network_type, downlink_mbps, battery_pct,
  temperature_c, air_pm25, note, created_at timestamptz
)
```

Segurança: **RLS habilitada**. Políticas: leitura pública (mapa colaborativo),
inserção pública validada (faixa de lat/lng, tamanho de `device_id`, limites de
texto) e **UPDATE/DELETE negados** — nenhum cliente pode adulterar ou apagar
leituras alheias. O acesso é feito via Data API (PostgREST) com chave
publicável; segredos de serviço nunca chegam ao navegador.

### 10.2 Como os sensores enviam os dados?

O **próprio smartphone é o nó IoT**. `src/lib/iot/device.ts` lê as APIs web do
dispositivo:

| Dado | API do navegador |
| --- | --- |
| Localização + precisão | Geolocation API (`getCurrentPosition`) |
| Rede sem fio (WiFi/4G/5G) e downlink | Network Information API |
| Nível de bateria | Battery Status API |
| Plataforma / tipo de aparelho | User-Agent Client Hints |

`src/lib/iot/cloud.ts` enriquece a leitura com a **temperatura real do ponto**
(Open-Meteo) e publica a linha na nuvem via HTTPS. O fluxo é
`dispositivo → HTTPS/Data API → Postgres → Realtime → mapa`, ou seja um pipeline
publish/subscribe clássico de IoT, sem broker próprio a manter.

### 10.3 O sistema funciona em smartphone?

Sim, é **PWA instalável** (`public/manifest.webmanifest` + `public/sw.js`),
com ícone próprio, `display: standalone` e cache offline (network-first para
HTML, cache-first para assets versionados). Além disso o mapa tem otimizações
específicas de mobile: `zoomSnap` reduzido, animações desligadas durante
gestos, *debounce* de bbox maior (900 ms) e atenuação de overlays durante
pan/zoom — o toque continua fluido mesmo com todas as camadas ligadas.

### 10.4 Como a localização do usuário é utilizada?

Três usos, sempre com consentimento explícito do navegador:

1. **Centralizar o mapa** no usuário (botão GPS da MapToolbar), com feedback
   da precisão em metros.
2. **Contextualizar as camadas**: o bbox resultante dispara a recarga de
   qualidade do ar, clima e queimadas *daquela* região.
3. **Publicar telemetria** (opcional): só quando o usuário aperta "publicar" no
   app de sensores, a coordenada vira uma linha em `sensor_readings`.

Nada é enviado em segundo plano; sem ação do usuário, a localização só existe
na memória da aba.

### 10.5 Como ocorre a atualização em tempo real?

Três mecanismos combinados:

- **Realtime do banco** — canal Postgres Changes: cada `INSERT` em
  `sensor_readings` chega por WebSocket e o marcador aparece no mapa
  instantaneamente, sem *polling*.
- **Auto-refresh configurável** (Off / 2 / 5 / 10 min) das fontes públicas,
  emitido por `layers.setRefreshInterval`; cada camada exibe um selo "atualizado
  há Xs".
- **Recarga orientada a viewport** — `map.bbox` (com *debounce*) reconstrói as
  camadas dependentes de área quando o usuário navega.

Por cima disso há o cache **SWR** (`src/lib/gis/cache.ts`): entrega o dado em
cache na hora e revalida em segundo plano, com *fallback stale* quando a rede
falha — por isso a interface nunca "pisca" nem trava esperando a API.

### 10.6 Qual a arquitetura do sistema?

Arquitetura **orientada a eventos, em quatro camadas**, detalhada na seção 3:

1. **Apresentação** — React 19 + TanStack Start; `MapKernel` (Leaflet, instância
   única) e `LayersApp` nunca se importam mutuamente.
2. **Kernel de eventos** — Event Bus tipado (mitt) com canais
   `map.*`, `layers.*`, `timeline.*`, `filters.*`, `theme.*`, `api.status`.
   É o contrato do sistema: trocar o mapa ou adicionar camada não toca a UI.
3. **Serviços de dados** — providers puros (`USGS`, `OpenAQ`, `NASA FIRMS`,
   `NASA GIBS`, `Open-Meteo`, `RainViewer`, `NOAA CPC`, IoT/nuvem) envolvidos
   por cache SWR; proxies server-side em Cloudflare Workers resolvem CORS e
   aplicam `stale-while-revalidate`.
4. **Persistência em nuvem** — Postgres gerenciado com RLS + Realtime.

Padrões aplicados: *Event Bus / Pub-Sub*, *Strategy* (cada `LayerDef` encapsula
build/opacity/dispose), *Stale-While-Revalidate*, *Backend-for-Frontend* (rotas
`/api/public/*`) e *Offline-First* (PWA).

---

## 10. Camadas ativas por padrão

Ao abrir o sistema — e a cada nova localização aberta pela busca ou pelo GPS —
as camadas abaixo já entram ligadas e recarregam para aquela área:

| Camada | Fonte | Escopo |
| --- | --- | --- |
| Temperatura / clima urbano | Open-Meteo | cidades do viewport; sem cidade catalogada, amostra o próprio viewport (centro + 4 quadrantes) |
| Chuva — radar global | RainViewer | mosaico global de precipitação, quadro mais recente |
| Vento e rajadas | Open-Meteo | no popup de cada ponto de clima |
| Qualidade do ar (PM2.5) | OpenAQ v3 | estações dentro do bbox |
| Queimadas / focos ativos | NASA FIRMS (VIIRS) | focos das últimas 24 h no bbox |
| Vegetação NDVI | NASA GIBS (MODIS) | mosaico global 8 dias |
| Terremotos | USGS | global, 24 h |
| El Niño / La Niña | NOAA CPC | região Niño 3.4 |

Assim, qualquer cidade do mundo aberta no mapa mostra em tempo real
temperatura, chuva, vento, ar, fogo e vegetação — sem dado simulado.

---

## 11. Créditos e fontes de dados

- U.S. Geological Survey — Earthquake Hazards Program
- OpenAQ — plataforma aberta de qualidade do ar
- NOAA Climate Prediction Center — Oceanic Niño Index (ONI)
- OpenStreetMap contributors — cartografia base
- CARTO — estilos de basemap escuro/claro

Todos os dados são consumidos sob as licenças abertas de cada
provedor. Este projeto é acadêmico, sem fins comerciais.
