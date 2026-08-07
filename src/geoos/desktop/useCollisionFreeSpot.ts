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

      // Varredura em grade de toda a viewport. Percorremos as posições
      // possíveis (passo de 16px, limitado a ~40x40 amostras) e escolhemos a
      // primeira totalmente livre, priorizando o canto inferior esquerdo e,
      // em seguida, faixas próximas às bordas. Funciona em qualquer largura
      // de tela porque os limites derivam da viewport medida em runtime.
      const maxLeft = Math.max(MARGIN, vw - w - MARGIN);
      const maxTop = Math.max(MARGIN, vh - h - MARGIN - safeBottom);
      const stepX = Math.max(16, Math.round((maxLeft - MARGIN) / 40) || 16);
      const stepY = Math.max(16, Math.round((maxTop - MARGIN) / 40) || 16);

      const xs: number[] = [];
      for (let x = MARGIN; x <= maxLeft; x += stepX) xs.push(x);
      if (xs[xs.length - 1] !== maxLeft) xs.push(maxLeft);

      const ys: number[] = [];
      for (let y = maxTop; y >= MARGIN; y -= stepY) ys.push(y);
      if (ys[ys.length - 1] !== MARGIN) ys.push(MARGIN);

      const candidates: Array<{ left: number; top: number }> = [];
      for (const y of ys) for (const x of xs) candidates.push({ left: x, top: y });



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

      setPos((p) => (Math.abs(p.left - best.left) < 1 && Math.abs(p.top - best.top) < 1 ? p : best));
     } catch {
      /* posicionamento é best-effort */
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
