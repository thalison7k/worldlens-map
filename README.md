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

### 3.3 Módulo de camadas (`src/geoos/apps/LayersApp.tsx`)

Único app funcional após a decisão de foco ambiental estrito:

- Toggle independente por camada (emite `map.toggleLayer`).
- Painel KPI ao vivo (camadas ativas, pontos renderizados,
  sismo máximo em 24h) alimentado por `map.layerBuilt`.
- Card ENSO com fase e anomalia SST atual.
- Atalho "último sismo" — clique dispara `map.flyTo`.
- Auto-refresh a cada 5 minutos.

### 3.4 Providers (`src/lib/gis/providers/*`)

Cada provider é uma função pura `() => Promise<T>` envolvida por
`swr(key, ttl, fetcher)` (`src/lib/gis/cache.ts`) — cache em memória
+ `localStorage` com fallback *stale-any* quando a rede falha.

| Provider | Fonte | TTL | Observações |
| --- | --- | --- | --- |
| `usgs.ts` | USGS GeoJSON summary feed | 5 min | CORS liberado, uso direto |
| `openaq.ts` | OpenAQ v3 `/locations` | 10 min | via proxy `/api/public/openaq` |
| `enso.ts` | NOAA CPC `detrend.nino34.ascii` | 60 min | via proxy `/api/public/enso` (parse ASCII) |

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

## 9. Créditos e fontes de dados

- U.S. Geological Survey — Earthquake Hazards Program
- OpenAQ — plataforma aberta de qualidade do ar
- NOAA Climate Prediction Center — Oceanic Niño Index (ONI)
- OpenStreetMap contributors — cartografia base
- CARTO — estilos de basemap escuro/claro

Todos os dados são consumidos sob as licenças abertas de cada
provedor. Este projeto é acadêmico, sem fins comerciais.
