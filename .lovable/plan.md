# GeoOS 4.0 — Geospatial Operating System

Reestruturação completa: o projeto deixa de ser um Dashboard GIS e passa a ser um **Sistema Operacional Geoespacial**. O mapa vira o núcleo (kernel visual), e todas as funcionalidades viram **apps** independentes que abrem em janelas dentro de um desktop.

Escopo grande demais para uma entrega só. Proponho **4 sub-fases** dentro da Fase 4, entregando cada uma como um marco funcional. Confirme se topa esse recorte antes de eu começar a construir.

---

## Fase 4.1 — GeoOS Core + Desktop Shell (entrega imediata)

O esqueleto do SO. Sem isso nada mais funciona.

- **GeoOS Core** (`src/geoos/core/`): kernel client-side, singleton com Event Bus (pub/sub tipado), AppRegistry, WindowManager, WorkspaceManager, NotificationCenter, PermissionService, CacheStore. Zero dependência entre módulos — tudo conversa via eventos (`geoos.map.flyTo`, `geoos.app.open`, `geoos.layer.toggle`, etc).
- **Desktop shell** (`src/geoos/desktop/`):
  - Mapa em tela cheia como **wallpaper vivo** (o `WorldMap` atual vira `MapKernel`, sempre montado no fundo).
  - **Sidebar fixa** à esquerda: workspaces + apps favoritos.
  - **Dock inferior** estilo macOS: apps ativos + atalhos rápidos, com magnificação no hover.
  - **Topbar**: busca global (⌘K), relógio, notificações, perfil.
  - **Activity Center** (drawer direito): alertas, eventos, IA insights.
  - **Command Palette** (⌘K): busca fuzzy de apps, comandos, lugares.
- **Window System**: janelas flutuantes drag/resize/minimize/maximize, snap para bordas, empilhamento (z-index), estado persistido por workspace. Base em `react-rnd` (leve, sem dependências pesadas).
- **Design system Enterprise**: refino dos tokens em `src/styles.css` para look Palantir/Linear — glassmorphism com `backdrop-filter`, dark+light, animações suaves via tokens de transição. Sem cor hardcoded.
- Rota `/` vira a Home do GeoOS. `/map` permanece como deep-link que abre o app Geo Maps já maximizado.

## Fase 4.2 — Apps Framework + primeiros 6 apps

- **AppShell**: contrato `GeoApp` (`id, name, icon, description, permissions, defaultSize, component, onOpen, onClose`). Registro central; cada app é lazy-loaded via `React.lazy`.
- **Workspaces**: 10 workspaces (Ambiental, Defesa Civil, Prefeitura, Mobilidade, Energia, Planejamento Urbano, Agricultura, Clima, Segurança, Satélite). Cada um define layers ativas, apps disponíveis, tema, filtros default. Persistidos em `localStorage` (migra para Cloud na 4.4).
- **Apps entregues nesta fase**:
  1. **Geo Maps** — o mapa em janela (na verdade controla o MapKernel de fundo).
  2. **Layers** — o LayerManager atual como app.
  3. **Analysis Engine** — ferramentas de desenho (ponto/linha/polígono/retângulo/círculo) via `leaflet-draw`; ao fechar seleção calcula área/perímetro/densidade de ocorrências/vegetação/temperatura média/sensores/infra — usa os simuladores existentes agregados por bbox.
  4. **Smart Inspect** — clique em qualquer marker abre painel lateral com histórico, fotos, indicadores, objetos próximos (kNN sobre pontos visíveis).
  5. **Temporal Engine** — Timeline mundial (ano/mês/dia/hora); a Timeline atual vira este app, com animação de ocorrências e vegetação.
  6. **Command Center** — grid de KPIs, alertas, mini-mapa, feed em tempo real; parece um dashboard Datadog/Grafana.

## Fase 4.3 — IA (Geo AI Copilot + Insights + Decision + Simulation + Story)

Requer **Lovable Cloud + AI Gateway** (peço para habilitar quando chegar a hora).

- **Geo AI Copilot**: chat flutuante que controla o SO via linguagem natural. Comandos via LLM com tool-calling — cada tool dispara evento no Event Bus (`flyTo`, `toggleLayer`, `openApp`, `runAnalysis`, `generateReport`). Modelo default `google/gemini-3-flash-preview`.
- **AI Insights**: ao abrir uma região, chama o LLM com o resumo agregado do Analysis Engine e devolve resumo/problemas/oportunidades/riscos/sugestões em markdown streaming.
- **Decision Engine**: perguntas tipo "onde construir um hospital?" — heatmap de score combinando densidade populacional simulada, distância a hospitais existentes, acessibilidade viária; LLM explica o resultado.
- **Simulation Engine**: usuário desenha "novo parque / nova avenida / plantar árvores"; sistema recomputa métricas locais e mostra delta antes/depois lado a lado.
- **Geo Story**: gera relatório executivo em markdown + exporta PDF (`jspdf` + `html2canvas`).

## Fase 4.4 — Persistência, Performance, Polimento

- **Lovable Cloud**: workspaces, layouts de janela, favoritos, histórico do Copilot, relatórios salvos — tudo por usuário com RLS.
- **Performance**: Web Worker para agregações do Analysis Engine, virtualização das listas do Command Center, cache LRU no Core, renderização incremental de clusters.
- **Onboarding + atalhos**: tour rápido, cheatsheet ⌘K, tooltips.
- **Notificações realtime** via Supabase Realtime.
- **Testes** dos apps críticos com Playwright.

---

## Detalhes técnicos-chave

- **Event Bus**: `mitt` (2kb, tipado). Nenhum app importa outro app diretamente.
- **Window manager**: `react-rnd` para drag/resize; z-index gerenciado pelo Core.
- **State**: Zustand para o Core (leve, sem Provider hell), TanStack Query para dados server, `localStorage` para preferências até 4.4.
- **Command palette**: `cmdk` (já é o `<Command>` do shadcn — reaproveitar).
- **Map kernel**: `WorldMap` refatorado — o `<MapContainer>` fica montado uma única vez no `Desktop`, e apps enviam intents (`map.flyTo`, `map.setLayers`) via bus. Elimina o erro `_leaflet_pos` (mapa nunca é desmontado).
- **Design**: glassmorphism (`bg-background/60 backdrop-blur-xl border border-white/10`), sombras suaves em token `--shadow-window`, transições em `--motion-*`. Dark-first, light disponível.
- **SEO/head**: `/` = "GeoOS — Geospatial Operating System"; `/map` mantém metadata própria.

---

## O que peço para você confirmar antes de eu tocar em código

1. **Recorte OK?** Executo **Fase 4.1 completa agora** (Core + Desktop shell + Window system + Command Palette + refactor do mapa para MapKernel), e nas mensagens seguintes fazemos 4.2 → 4.3 → 4.4. Ou você quer que eu tente empacotar 4.1 + 4.2 numa única entrega (fica bem maior, mais risco de bug)?
2. **Habilito o Lovable Cloud já na 4.1** (para preparar auth e persistência de workspaces desde o começo) ou só quando chegar na 4.3/4.4?
3. **Nome público**: uso **"GeoOS"** em toda a UI, ou você prefere outro branding (ex: "TerraOS", "Atlas", nome da sua empresa)?

Responde as 3 e eu já começo a Fase 4.1.
