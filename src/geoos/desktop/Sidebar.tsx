import { BrandGlobe } from "./BrandGlobe";
import { GamaTecBadge } from "./GamaTecBadge";

/**
 * Sidebar — reduced to a brand rail. Workspace switching and favorites
 * were removed with the legacy modules. Hidden on small screens.
 */
export function Sidebar() {
  return (
    <aside data-geoos-obstacle className="pointer-events-auto fixed left-0 top-0 z-40 hidden h-full w-12 flex-col items-center gap-2 border-r border-white/10 bg-[color:var(--geoos-surface)]/70 py-3 backdrop-blur-xl sm:flex">
      <BrandGlobe size={34} className="transition-transform duration-300 hover:scale-110" />
      <div className="mt-auto flex flex-col items-center gap-2">
        <GamaTecBadge variant="rail" />
      </div>
    </aside>
  );
}
  );
}
