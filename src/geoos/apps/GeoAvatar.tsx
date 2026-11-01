/**
 * "Gaia" — personagem da Geo AI: um pequeno globo-sentinela ambiental.
 * Estados: idle (respira/pisca), thinking (órbita de satélite + olhos girando),
 * talking (boca animada + ondas). Animações exclusivas do chat Geo AI.
 */
import { useId } from "react";

type Mood = "idle" | "thinking" | "talking";

export function GeoAvatar({ mood = "idle", size = 40 }: { mood?: Mood; size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={`gaia gaia-${mood} relative shrink-0`} style={{ width: size, height: size }} role="img" aria-label={`Gaia, assistente Geo AI — ${mood === "thinking" ? "analisando" : mood === "talking" ? "respondendo" : "disponível"}`}>
      <style>{`
        .gaia svg{overflow:visible}
        .gaia .body{transform-origin:32px 34px;animation:gaia-breathe 4s ease-in-out infinite}
        .gaia .eye{transform-origin:center;transform-box:fill-box;animation:gaia-blink 4.5s infinite}
        .gaia .leaf{transform-origin:50% 100%;transform-box:fill-box;animation:gaia-sway 2.6s ease-in-out infinite}
        .gaia .orbit{transform-origin:32px 34px;opacity:0;transition:opacity .3s}
        .gaia .mouth{transform-origin:center;transform-box:fill-box}
        .gaia .wave{opacity:0}
        .gaia .pupil{animation:gaia-look 8s ease-in-out infinite}
        .gaia .hand{transform-box:fill-box;transform-origin:50% 20%;animation:gaia-hand 4s ease-in-out infinite}
        .gaia-thinking .body{animation:gaia-think 2.4s ease-in-out infinite}
        .gaia-thinking .orbit{opacity:1;animation:gaia-spin 3s linear infinite}
        .gaia-thinking .pupil{animation:gaia-look 2s ease-in-out infinite}
        .gaia-talking .body{animation:gaia-nod 1.6s ease-in-out infinite}
        .gaia-talking .mouth{animation:gaia-talk .55s ease-in-out infinite}
        .gaia-talking .hand{animation:gaia-hand .9s ease-in-out infinite}
        .gaia-talking .wave{transform-origin:32px 34px;animation:gaia-wave 1.8s ease-out infinite}
        .gaia-talking .wave.w2{animation-delay:.4s}
        @keyframes gaia-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-1.5px) scale(1.03)}}
        @keyframes gaia-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
        @keyframes gaia-sway{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(10deg)}}
        @keyframes gaia-spin{to{transform:rotate(360deg)}}
        @keyframes gaia-look{0%,30%,100%{transform:translate(0,0)}45%,65%{transform:translate(1px,-.6px)}80%{transform:translate(-1px,0)}}
        @keyframes gaia-talk{0%,100%{transform:scaleY(.45)}25%{transform:scaleY(1.4)}55%{transform:scaleY(.75)}80%{transform:scaleY(1.15)}}
        @keyframes gaia-wave{0%{opacity:.5;transform:scale(.85)}100%{opacity:0;transform:scale(1.35)}}
        @keyframes gaia-hand{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(18deg)}}
        @keyframes gaia-think{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-1px) rotate(4deg)}}
        @keyframes gaia-nod{0%,100%{transform:translateY(0)}35%{transform:translateY(-1px) rotate(2deg)}70%{transform:translateY(.6px) rotate(-2deg)}}
        @media (prefers-reduced-motion:reduce){.gaia *{animation:none!important}}
      `}</style>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-sea`} cx="30%" cy="25%" r="80%"><stop stopColor="var(--gaia-ocean-light)" /><stop offset=".65" stopColor="var(--gaia-ocean)" /><stop offset="1" stopColor="var(--gaia-depth)" /></radialGradient>
          <radialGradient id={`${id}-shine`} cx="30%" cy="25%"><stop stopColor="var(--gaia-eye)" stopOpacity=".35" /><stop offset="1" stopColor="var(--gaia-eye)" stopOpacity="0" /></radialGradient>
        </defs>
        <circle className="wave" cx="32" cy="34" r="24" fill="none" stroke="var(--geoos-accent)" strokeWidth="1.2" />
        <circle className="wave w2" cx="32" cy="34" r="24" fill="none" stroke="var(--geoos-accent)" strokeWidth="1.2" />
        <g className="body">
          <path className="hand" d="M13 36 Q5 32 8 27" fill="none" stroke="var(--gaia-land)" strokeWidth="3" strokeLinecap="round" />
          <path className="hand" d="M51 36 Q59 32 56 27" fill="none" stroke="var(--gaia-land)" strokeWidth="3" strokeLinecap="round" />
          <path className="leaf" d="M32 12 C 26 6, 34 0, 38 4 C 36 8, 34 10, 32 12 Z" fill="var(--gaia-land)" />
          <circle cx="32" cy="34" r="20" fill={`url(#${id}-sea)`} stroke="var(--geoos-accent)" strokeWidth="1.5" />
          <path d="M18 28 q6 -6 12 -2 q4 3 2 7 q-4 4 -9 2 q-5 -2 -5 -7z M37 40 q6 -3 9 1 q1 5 -5 6 q-5 0 -4 -7z" fill="var(--gaia-land)" opacity=".85" />
          <ellipse cx="32" cy="34" rx="20" ry="7" fill="none" stroke="var(--gaia-eye)" strokeOpacity=".15" />
          <circle cx="32" cy="34" r="19" fill={`url(#${id}-shine)`} />
          <g className="eye"><ellipse cx="25" cy="32" rx="3.4" ry="4" fill="var(--gaia-eye)" /><circle className="pupil" cx="25.5" cy="32.5" r="1.8" fill="var(--gaia-depth)" /><circle cx="25" cy="31.5" r=".6" fill="var(--gaia-eye)" /></g>
          <g className="eye"><ellipse cx="39" cy="32" rx="3.4" ry="4" fill="var(--gaia-eye)" /><circle className="pupil" cx="39.5" cy="32.5" r="1.8" fill="var(--gaia-depth)" /><circle cx="39" cy="31.5" r=".6" fill="var(--gaia-eye)" /></g>
          <ellipse className="mouth" cx="32" cy="42" rx="3.5" ry="1.6" fill="var(--gaia-depth)" />
        </g>
        <g className="orbit">
          <ellipse cx="32" cy="34" rx="28" ry="10" fill="none" stroke="var(--geoos-accent)" strokeOpacity=".5" strokeDasharray="2 3" />
          <rect x="58" y="31" width="5" height="5" rx="1" fill="var(--geoos-accent)" />
        </g>
      </svg>
    </div>
  );
}
