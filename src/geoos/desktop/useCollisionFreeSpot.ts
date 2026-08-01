import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Rect = { left: number; top: number; right: number; bottom: number };

const MARGIN = 8;

function intersects(a: Rect, b: Rect, pad = 6) {
  return !(
    a.right + pad <= b.left ||
    a.left - pad >= b.right ||
    a.bottom + pad <= b.top ||
    a.top - pad >= b.bottom
  );
}

function overlapArea(a: Rect, b: Rect) {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

/**
 * useCollisionFreeSpot — mede todos os elementos marcados com
 * `data-geoos-obstacle` e escolhe, entre posições candidatas, a primeira que
 * não colide com nenhum deles. Se todas colidirem, usa a de menor sobreposição.
 * Funciona em qualquer tamanho de tela (desktop, tablet, Android/iOS).
 */
export function useCollisionFreeSpot<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: MARGIN, top: MARGIN });

  useLayoutEffect(() => {
    let raf = 0;

    const compute = () => {
     try {
      const el = ref.current;
      if (!el) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const safeBottom = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--geoos-safe-bottom") || "0",
      ) || 0;

      const w = el.offsetWidth || 200;
      const h = el.offsetHeight || 28;

      const obstacles: Rect[] = [];
      document.querySelectorAll<HTMLElement>("[data-geoos-obstacle]").forEach((o) => {
        if (o === el || o.contains(el)) return;
        const r = o.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        if (getComputedStyle(o).visibility === "hidden") return;
        obstacles.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      });

      // Candidatos, em ordem de preferência (todos dentro da viewport).
      const candidates: Array<{ left: number; top: number }> = [
        ...(() => {
          // Colunas: depois de um rail lateral (se existir), à esquerda e à direita.
          const railRight = obstacles
            .filter((o) => o.left <= MARGIN + 4 && o.bottom - o.top > vh * 0.5)
            .reduce((m, o) => Math.max(m, o.right), 0);
          const xs = [
            railRight ? railRight + MARGIN : MARGIN,
            MARGIN,
            vw - w - MARGIN,
            Math.max(MARGIN, (vw - w) / 2),
          ];
          const bottom = vh - h - MARGIN - safeBottom;
          const ys = [bottom, bottom - 52, bottom - 104, bottom - 156, MARGIN + 52, MARGIN];
          // Faixas livres entre painéis (ex.: entre a janela do app e o dock).
          const edges = obstacles.map((o) => o.bottom + MARGIN).filter((y) => y > 0 && y + h < vh);
          for (const y of edges) ys.splice(0, 0, y);
          const out: Array<{ left: number; top: number }> = [];
          for (const y of ys) for (const x of xs) out.push({ left: x, top: y });
          return out;
        })(),

      ];


      let best = candidates[0];
      let bestScore = Number.POSITIVE_INFINITY;

      for (const c of candidates) {
        const left = Math.min(Math.max(MARGIN, c.left), Math.max(MARGIN, vw - w - MARGIN));
        const top = Math.min(Math.max(MARGIN, c.top), Math.max(MARGIN, vh - h - MARGIN));
        const rect: Rect = { left, top, right: left + w, bottom: top + h };
        let score = 0;
        for (const o of obstacles) {
          if (intersects(rect, o)) score += overlapArea(rect, o) + 1;
        }
        if (score === 0) {
          best = { left, top };
          bestScore = 0;
          break;
        }
        if (score < bestScore) {
          bestScore = score;
          best = { left, top };
        }
      }

      (window as unknown as Record<string, unknown>).__geoosChipDebug = { best, bestScore, w, h, obstacles, candidates: candidates.slice(0, 6) };
      setPos((p) => (Math.abs(p.left - best.left) < 1 && Math.abs(p.top - best.top) < 1 ? p : best));
     } catch (err) {
      (window as unknown as Record<string, unknown>).__geoosChipDebug = { error: String(err) };
     }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    const ro = new ResizeObserver(schedule);
    if (ref.current) ro.observe(ref.current);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    const iv = window.setInterval(schedule, 1000);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      ro.disconnect();
      mo.disconnect();
      window.clearInterval(iv);
    };
  }, []);

  return { ref, pos };
}

export function useSafeBottomVar() {
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom,0px);width:1px;pointer-events:none;visibility:hidden";
    document.body.appendChild(probe);
    document.documentElement.style.setProperty("--geoos-safe-bottom", `${probe.offsetHeight}px`);
    probe.remove();
  }, []);
}
