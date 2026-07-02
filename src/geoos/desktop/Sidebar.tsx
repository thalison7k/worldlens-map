import { useGeoOS } from "@/geoos/core/store";
import { WORKSPACES } from "@/geoos/core/workspaces";
import { APPS_BY_ID } from "@/geoos/apps/registry";
import { Globe } from "lucide-react";

const FAVORITES = ["geo-maps", "layers", "geo-ai", "analysis", "command-center", "temporal", "geo-story"];

export function Sidebar() {
  const workspaceId = useGeoOS((s) => s.workspaceId);
  const setWorkspace = useGeoOS((s) => s.setWorkspace);
  const openApp = useGeoOS((s) => s.openApp);
  const active = WORKSPACES.find((w) => w.id === workspaceId);

  return (
    <aside className="pointer-events-auto fixed left-0 top-0 z-40 flex h-full w-16 flex-col items-center gap-2 border-r border-white/10 bg-[color:var(--geoos-surface)]/70 py-3 backdrop-blur-xl">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--geoos-accent)] to-cyan-400 text-black shadow-lg">
        <Globe className="h-5 w-5" />
      </div>

      <div className="mt-2 w-full px-2">
        <div className="mb-1 text-center text-[9px] uppercase tracking-widest text-white/40">WS</div>
        <div className="flex flex-col gap-1">
          {WORKSPACES.map((w) => {
            const isActive = w.id === workspaceId;
            return (
              <button
                key={w.id}
                onClick={() => setWorkspace(w.id)}
                title={w.name}
                className={`h-9 w-full rounded-lg border text-[10px] font-medium transition ${
                  isActive
                    ? "border-transparent text-black"
                    : "border-white/5 bg-white/[0.03] text-white/60 hover:bg-white/10"
                }`}
                style={isActive ? { background: `hsl(${w.accent})` } : undefined}
              >
                {w.name.slice(0, 2).toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto w-full px-2">
        <div className="mb-1 text-center text-[9px] uppercase tracking-widest text-white/40">Fav</div>
        <div className="flex flex-col gap-1">
          {FAVORITES.map((id) => {
            const app = APPS_BY_ID[id];
            if (!app) return null;
            return (
              <button
                key={id}
                onClick={() => openApp(id, app.defaultSize)}
                title={app.name}
                className="grid h-9 w-full place-items-center rounded-lg border border-white/5 bg-white/[0.03] text-white/70 hover:bg-white/10"
              >
                <app.icon className="h-4 w-4" style={{ color: `hsl(${app.color})` }} />
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
