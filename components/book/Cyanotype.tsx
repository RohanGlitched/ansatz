/**
 * The cyanotype duotone every clip on a plate is printed through: shadows go to deep Prussian blue, highlights to
 * sun-print white. Defined once in the layout; used as `filter: url(#cyanotype)`.
 */
export function CyanotypeDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <filter id="cyanotype" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" />
        <feComponentTransfer>
          <feFuncR type="table" tableValues="0.035 0.075 0.26 0.80 0.94" />
          <feFuncG type="table" tableValues="0.12 0.21 0.42 0.88 0.955" />
          <feFuncB type="table" tableValues="0.25 0.40 0.62 0.93 0.965" />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

/** The Ansatz mark: a parabola in white ink through five measured points, on a Prussian square. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="3" fill="#163d6e" />
      <path d="M4.5 23 Q14 -6.5 23.5 23" stroke="#eef2f4" strokeWidth="1.4" fill="none" />
      {[
        [5.7, 18.8],
        [9.3, 10.4],
        [14, 7.8],
        [18.7, 10.4],
        [22.3, 18.8],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#ff7b2e" />
      ))}
    </svg>
  );
}
