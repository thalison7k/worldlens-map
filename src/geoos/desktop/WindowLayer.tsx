import { useRef } from "react";
import { Rnd } from "react-rnd";
import { Minus, Square, X } from "lucide-react";
import { useGeoOS } from "@/geoos/core/store";
import { APPS_BY_ID } from "@/geoos/apps/registry";
import type { WindowState } from "@/geoos/core/types";
import { Suspense, createElement } from "react";
import { AppErrorBoundary } from "./AppErrorBoundary";

/** Impede que o toque num botão do título vire gesto de arrastar da janela. */
const stopDrag = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
  e.stopPropagation();
};

export function AppWindow({ state }: { state: WindowState }) {
  const app = APPS_BY_ID[state.appId];
  const { focusApp, closeApp, minimizeApp, maximizeApp, moveApp, resizeApp } = useGeoOS();
  const ref = useRef<Rnd | null>(null);

  if (!app || state.minimized) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const isMobile = vw < 640;
  const isMax = state.maximized;
  const clampedW = Math.min(state.width, vw - 16);
  const clampedH = Math.min(state.height, vh - 100);
  const geometry = isMax
    ? isMobile
      ? { x: 0, y: 44, width: vw, height: vh - 44 - 76 }
      : { x: 8, y: 56, width: vw - 96, height: vh - 140 }
    : {
        x: Math.min(Math.max(state.x, 0), Math.max(0, vw - clampedW)),
        y: Math.min(Math.max(state.y, 0), Math.max(0, vh - 80)),
        width: clampedW,
        height: clampedH,
      };

  const edge = isMobile ? 22 : 12;
  const corner = isMobile ? 30 : 18;
  const touchEdge = { width: edge, height: edge } as const;
  const touchCorner = { width: corner, height: corner } as const;

  return (
    <Rnd
      ref={ref}
      size={{ width: geometry.width, height: geometry.height }}
      position={{ x: geometry.x, y: geometry.y }}
      minWidth={isMobile ? 240 : 280}
      minHeight={160}
      maxWidth={vw}
      maxHeight={vh}
      bounds="parent"
      dragHandleClassName="geoos-window-drag"
      cancel="button, input, textarea, select, a[href]"
      className="pointer-events-auto"
      style={{ zIndex: state.z, pointerEvents: "auto" }}
      onDragStop={(_, d) => {
        if (isMax) {
          maximizeApp(state.appId);
          moveApp(state.appId, Math.max(0, d.x), Math.max(0, d.y));
        } else {
          moveApp(state.appId, d.x, d.y);
        }
      }}
      onResizeStop={(_, __, refEl, ___, pos) => {
        resizeApp(state.appId, refEl.offsetWidth, refEl.offsetHeight);
        moveApp(state.appId, pos.x, pos.y);
      }}
      onPointerDown={() => focusApp(state.appId)}
      enableResizing={!isMax}
      resizeHandleStyles={{
        bottom: touchEdge,
        bottomLeft: touchCorner,
        bottomRight: touchCorner,
        left: touchEdge,
        right: touchEdge,
        top: touchEdge,
        topLeft: touchCorner,
        topRight: touchCorner,
      }}
    
    >
      <div
        data-geoos-obstacle
        className="geoos-window relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[color:var(--geoos-window)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      >
        <div
          className="geoos-window-drag flex h-11 cursor-move items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 select-none sm:h-9"
          onDoubleClick={() => maximizeApp(state.appId)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-white/70">
            <app.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{app.name}</span>
          </div>
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={(e) => { e.stopPropagation(); maximizeApp(state.appId); }}
            className="grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-md text-white/60 transition active:scale-95 hover:bg-white/10 hover:text-white sm:h-7 sm:w-7"
            aria-label={isMax ? "Restaurar janela" : "Expandir janela"}
            title={isMax ? "Restaurar" : "Expandir"}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={(e) => { e.stopPropagation(); minimizeApp(state.appId); }}
            className="grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-md text-white/60 transition active:scale-95 hover:bg-white/10 hover:text-white sm:h-7 sm:w-7"
            aria-label="Minimizar janela"
            title="Minimizar"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={(e) => { e.stopPropagation(); closeApp(state.appId); }}
            className="grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-md text-white/70 transition active:scale-95 hover:bg-red-500/80 hover:text-white sm:h-7 sm:w-7"
            aria-label="Fechar janela"
            title="Fechar (liberar o mapa)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="geoos-window-body geoos-scroll flex-1 overflow-hidden text-white">
          <AppErrorBoundary appName={app.name}>
            <Suspense fallback={<div className="p-6 text-xs text-white/50">Carregando…</div>}>
              {createElement(app.component as never)}
            </Suspense>
          </AppErrorBoundary>
        </div>

        {!isMax && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0.5 right-0.5 h-4 w-4 opacity-40"
            style={{
              background:
                "linear-gradient(135deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%, transparent 70%, currentColor 70%, currentColor 80%, transparent 80%)",
            }}
          />
        )}
      </div>
    </Rnd>
  );
}


export function WindowLayer() {
  const windows = useGeoOS((s) => s.windows);
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      <div className="pointer-events-none relative h-full w-full">
        {Object.values(windows).map((w) => (
          <AppWindow key={w.appId} state={w} />
        ))}
      </div>
    </div>
  );
}
