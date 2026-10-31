/**
 * "Gaia" — personagem da Geo AI: um pequeno globo-sentinela ambiental.
 * Estados: idle (respira/pisca), thinking (órbita de satélite + olhos girando),
 * talking (boca animada + ondas). Animações exclusivas do chat Geo AI.
 */
type Mood = "idle" | "thinking" | "talking";

export function GeoAvatar({ mood = "idle", size = 40 }: { mood?: Mood; size?: number }) {
  return (
    <div className={`gaia gaia-${mood} relative shrink-0`} style={{ width: size, height: size }} aria-label="Gaia, assistente Geo AI">
      <style>{`
        .gaia svg{overflow:visible}
        .gaia .body{transform-origin:50% 55%;animation:gaia-breathe 3.2s ease-in-out infinite}
        .gaia .eye{transform-origin:center;transform-box:fill-box;animation:gaia-blink 4.5s infinite}
        .gaia .leaf{transform-origin:50% 100%;transform-box:fill-box;animation:gaia-sway 2.6s ease-in-out infinite}
        .gaia .orbit{transform-origin:32px 34px;opacity:0;transition:opacity .3s}
        .gaia .mouth{transform-origin:center;transform-box:fill-box}
        .gaia .wave{opacity:0}
        .gaia-thinking .orbit{opacity:1;animation:gaia-spin 1.4s linear infinite}
        .gaia-thinking .pupil{animation:gaia-look 1.4s ease-in-out infinite}
        .gaia-talking .mouth{animation:gaia-talk .28s ease-in-out infinite alternate}
        .gaia-talking .wave{animation:gaia-wave 1.2s ease-out infinite}
        .gaia-talking .wave.w2{animation-delay:.4s}
        @keyframes gaia-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-1.5px) scale(1.03)}}
        @keyframes gaia-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
        @keyframes gaia-sway{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(10deg)}}
        @keyframes gaia-spin{to{transform:rotate(360deg)}}
        @keyframes gaia-look{0%,100%{transform:translateX(-1px)}50%{transform:translateX(1.2px)}}
        @keyframes gaia-talk{from{transform:scaleY(.35)}to{transform:scaleY(1.25)}}
        @keyframes gaia-wave{0%{opacity:.7;r:24}100%{opacity:0;r:34}}
        @media (prefers-reduced-motion:reduce){.gaia *{animation:none!important}}
      `}</style>
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <circle className="wave" cx="32" cy="34" r="24" fill="none" stroke="var(--geoos-accent)" strokeWidth="1.2" />
        <circle className="wave w2" cx="32" cy="34" r="24" fill="none" stroke="var(--geoos-accent)" strokeWidth="1.2" />
        <g className="body">
          <path className="leaf" d="M32 12 C 26 6, 34 0, 38 4 C 36 8, 34 10, 32 12 Z" fill="hsl(140 60% 50%)" />
          <circle cx="32" cy="34" r="20" fill="hsl(200 70% 38%)" stroke="var(--geoos-accent)" strokeWidth="1.5" />
          <path d="M18 28 q6 -6 12 -2 q4 3 2 7 q-4 4 -9 2 q-5 -2 -5 -7z M37 40 q6 -3 9 1 q1 5 -5 6 q-5 0 -4 -7z" fill="hsl(140 50% 45%)" opacity=".85" />
          <ellipse cx="32" cy="34" rx="20" ry="7" fill="none" stroke="white" strokeOpacity=".15" />
          <g className="eye"><ellipse cx="25" cy="32" rx="3.4" ry="4" fill="white" /><circle className="pupil" cx="25.5" cy="32.5" r="1.8" fill="hsl(220 40% 12%)" /></g>
          <g className="eye"><ellipse cx="39" cy="32" rx="3.4" ry="4" fill="white" /><circle className="pupil" cx="39.5" cy="32.5" r="1.8" fill="hsl(220 40% 12%)" /></g>
          <ellipse className="mouth" cx="32" cy="42" rx="3.5" ry="1.6" fill="hsl(220 40% 12%)" />
        </g>
        <g className="orbit">
          <ellipse cx="32" cy="34" rx="28" ry="10" fill="none" stroke="var(--geoos-accent)" strokeOpacity=".5" strokeDasharray="2 3" />
          <rect x="58" y="31" width="5" height="5" rx="1" fill="var(--geoos-accent)" />
        </g>
      </svg>
    </div>
  );
}
