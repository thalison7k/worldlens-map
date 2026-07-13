import { useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import { Minus, Square, X } from "lucide-react";
import { useGeoOS } from "@/geoos/core/store";
import { APPS_BY_ID } from "@/geoos/apps/registry";
import type { WindowState } from "@/geoos/core/types";
import { Suspense, createElement } from "react";

export function AppWindow({ state }: { state: WindowState }) {
  const app = APPS_BY_ID[state.appId];
  const { focusApp, closeApp, minimizeApp, maximizeApp, moveApp, resizeApp } = useGeoOS();
  const ref = useRef<Rnd | null>(null);

  if (!app || state.minimized) return null;

  const isMax = state.maximized;
  const geometry = isMax
    ? { x: 8, y: 56, width: window.innerWidth - 96, height: window.innerHeight - 140 }
    : { x: state.x, y: state.y, width: state.width, height: state.height };

  return (
    <Rnd
      ref={ref}
      size={{ width: geometry.width, height: geometry.height }}
      position={{ x: geometry.x, y: geometry.y }}
      minWidth={320}
      minHeight={200}
      bounds="parent"
      dragHandleClassName="geoos-window-drag"
      style={{ zIndex: state.z }}
      onDragStop={(_, d) => !isMax && moveApp(state.appId, d.x, d.y)}
      onResizeStop={(_, __, refEl, ___, pos) => {
        resizeApp(state.appId, refEl.offsetWidth, refEl.offsetHeight);
        moveApp(state.appId, pos.x, pos.y);
      }}
      onMouseDown={() => focusApp(state.appId)}
      disableDragging={isMax}
      enableResizing={!isMax}
    >
      <div className="geoos-window flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[color:var(--geoos-window)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div
          className="geoos-window-drag flex h-9 items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 select-none"
          onDoubleClick={() => maximizeApp(state.appId)}
        >
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); closeApp(state.appId); }}
              className="grid h-3.5 w-3.5 place-items-center rounded-full bg-red-500 text-black/80 hover:bg-red-400"
              aria-label="Fechar"
              title="Fechar"
            >
              <X className="h-2.5 w-2.5" strokeWidth={3} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); minimizeApp(state.appId); }}
              className="grid h-3.5 w-3.5 place-items-center rounded-full bg-yellow-500 text-black/80 hover:bg-yellow-400"
              aria-label="Minimizar"
              title="Minimizar"
            >
              <Minus className="h-2.5 w-2.5" strokeWidth={3} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); maximizeApp(state.appId); }}
              className="grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500 text-black/80 hover:bg-emerald-400"
              aria-label="Maximizar"
              title="Maximizar"
            >
              <Square className="h-2 w-2" strokeWidth={3} />
            </button>
          </div>
          <div className="ml-3 flex flex-1 items-center gap-2 text-[11px] text-white/70">
            <app.icon className="h-3 w-3" />
            <span>{app.name}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); minimizeApp(state.appId); }}
            className="grid h-6 w-6 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Minimizar janela"
            title="Minimizar"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); closeApp(state.appId); }}
            className="grid h-6 w-6 place-items-center rounded-md text-white/70 hover:bg-red-500/80 hover:text-white"
            aria-label="Fechar janela"
            title="Fechar (liberar o mapa)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden text-white">
          <Suspense fallback={<div className="p-6 text-xs text-white/50">Carregando…</div>}>
            {createElement(app.component as any)}
          </Suspense>
        </div>
      </div>
    </Rnd>
  );
}

export function WindowLayer() {
  const windows = useGeoOS((s) => s.windows);
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      <div className="pointer-events-auto relative h-full w-full">
        {Object.values(windows).map((w) => (
          <AppWindow key={w.appId} state={w} />
        ))}
      </div>
    </div>
  );
}
