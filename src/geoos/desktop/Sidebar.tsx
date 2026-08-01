import { Globe } from "lucide-react";

/**
 * Sidebar — reduced to a brand rail. Workspace switching and favorites
 * were removed with the legacy modules. Hidden on small screens.
 */
export function Sidebar() {
  return (
    <aside data-geoos-obstacle className="pointer-events-auto fixed left-0 top-0 z-40 hidden h-full w-12 flex-col items-center gap-2 border-r border-white/10 bg-[color:var(--geoos-surface)]/70 py-3 backdrop-blur-xl sm:flex">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--geoos-accent)] to-cyan-400 text-black shadow-lg">
        <Globe className="h-4 w-4" />
      </div>
      <div className="mt-auto text-[9px] uppercase tracking-widest text-white/30 [writing-mode:vertical-rl]">
        GeoOS · Env
      </div>
    </aside>
  );
}
