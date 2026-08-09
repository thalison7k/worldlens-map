import { useGeoOS } from "@/geoos/core/store";
import { APPS_BY_ID } from "@/geoos/apps/registry";
import { ChevronUp } from "lucide-react";

/**
 * Bandeja de janelas em segundo plano (minimizadas).
 * Aparece acima do Dock em mobile e desktop; clicar restaura a janela.
 */
export function MinimizedTray() {
  const windows = useGeoOS((s) => s.windows);
  const focusApp = useGeoOS((s) => s.focusApp);

  const minimized = Object.values(windows).filter((w) => w.minimized);
  if (minimized.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-[4.75rem] left-1/2 z-40 w-[min(96vw,44rem)] -translate-x-1/2 px-2">
      <div
        data-geoos-obstacle
        className="geoos-scroll pointer-events-auto flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-[color:var(--geoos-surface)]/70 px-2 py-1.5 shadow-2xl backdrop-blur-xl"
      >
        <span className="hidden shrink-0 px-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/35 sm:inline">
          Segundo plano
        </span>
        {minimized.map((w) => {
          const app = APPS_BY_ID[w.appId];
          if (!app) return null;
          return (
            <button
              key={w.appId}
              type="button"
              onClick={() => focusApp(w.appId)}
              title={`Restaurar ${app.name}`}
              className="flex h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-[11px] text-white/80 transition active:scale-95 hover:bg-white/12 hover:text-white"
            >
              <app.icon className="h-3.5 w-3.5 shrink-0" style={{ color: `hsl(${app.color})` }} />
              <span className="max-w-28 truncate">{app.name}</span>
              <ChevronUp className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
