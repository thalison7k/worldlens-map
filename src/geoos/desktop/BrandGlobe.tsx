/**
 * BrandGlobe — ícone 3D animado do GeoOS.
 *
 * Globo com esfera sombreada (gradiente radial + terminador), meridianos que
 * giram continuamente, brilho especular, halo atmosférico e um satélite em
 * órbita. Puro SVG + SMIL/CSS, sem dependências e sem custo de layout.
 */
export function BrandGlobe({ size = 36, className = "" }: { size?: number; className?: string }) {
  const uid = `bg${size}`;
  return (
    <span
      className={`relative inline-grid place-items-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* halo atmosférico pulsante */}
      <span
        className="absolute inset-0 rounded-full opacity-70 blur-[6px] motion-safe:animate-[geoos-halo_3.6s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--geoos-accent) 70%, transparent), transparent 70%)",
        }}
      />
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="relative motion-safe:animate-[geoos-bob_5s_ease-in-out_infinite]"
        style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,.55))" }}
      >
        <defs>
          <radialGradient id={`${uid}-sphere`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#a5f3fc" />
            <stop offset="42%" stopColor="#22d3ee" />
            <stop offset="78%" stopColor="#4338ca" />
            <stop offset="100%" stopColor="#0b1024" />
          </radialGradient>
          <radialGradient id={`${uid}-spec`} cx="30%" cy="24%" r="30%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-rim`} cx="50%" cy="50%" r="50%">
            <stop offset="82%" stopColor="#67e8f9" stopOpacity="0" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.9" />
          </radialGradient>
          <clipPath id={`${uid}-clip`}>
            <circle cx="50" cy="50" r="38" />
          </clipPath>
        </defs>

        {/* esfera */}
        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-sphere)`} />

        {/* grade girando dentro da esfera (ilusão 3D) */}
        <g clipPath={`url(#${uid}-clip)`} stroke="#e0f2fe" fill="none" opacity="0.55">
          {/* paralelos fixos */}
          <ellipse cx="50" cy="50" rx="38" ry="12" strokeWidth="1.1" />
          <ellipse cx="50" cy="50" rx="34" ry="26" strokeWidth="0.9" opacity="0.6" />
          <ellipse cx="50" cy="34" rx="30" ry="8" strokeWidth="0.8" opacity="0.45" />
          <ellipse cx="50" cy="66" rx="30" ry="8" strokeWidth="0.8" opacity="0.45" />
          {/* meridianos animados: rx oscila para simular rotação */}
          {[0, 1, 2, 3].map((i) => (
            <ellipse key={i} cx="50" cy="50" rx="38" ry="38" strokeWidth="1" opacity="0.7">
              <animate
                attributeName="rx"
                dur="7s"
                begin={`${-i * 1.75}s`}
                repeatCount="indefinite"
                values="38;4;38;4;38"
                keyTimes="0;0.25;0.5;0.75;1"
                calcMode="spline"
                keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1"
              />
              <animate
                attributeName="opacity"
                dur="7s"
                begin={`${-i * 1.75}s`}
                repeatCount="indefinite"
                values="0.75;0.25;0.75;0.25;0.75"
              />
            </ellipse>
          ))}
          {/* terminador (sombra do lado escuro) */}
          <ellipse cx="72" cy="52" rx="42" ry="40" fill="#04070f" opacity="0.35" stroke="none" />
        </g>

        {/* brilho especular + rim light */}
        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-spec)`} />
        <circle cx="50" cy="50" r="38" fill={`url(#${uid}-rim)`} />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#67e8f9" strokeWidth="1.2" opacity="0.85" />

        {/* órbita + satélite */}
        <g className="motion-safe:animate-[geoos-orbit_6s_linear_infinite]" style={{ transformOrigin: "50px 50px" }}>
          <ellipse
            cx="50"
            cy="50"
            rx="46"
            ry="17"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1.2"
            opacity="0.55"
            transform="rotate(-24 50 50)"
          />
          <circle cx="96" cy="50" r="3.2" fill="#f0abfc" transform="rotate(-24 50 50)">
            <animate attributeName="r" dur="2s" values="3.2;4.2;3.2" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>
    </span>
  );
}
