/**
 * Klasik adam asmaca — tebeşirle karatahtaya çizilmiş gibi.
 *
 * Darağacı hep duruyor; adam altı parçada tamamlanıyor. Her yanlış harf bir
 * parça daha çizer ve parça, gerçekten o an çiziliyormuş gibi ucundan uzayarak
 * belirir (stroke-dashoffset).
 *
 * Tebeşir dokusu feTurbulence + feDisplacementMap ile: çizgi kenarları hafifçe
 * bozulup tozlu bir iz bırakıyor. Asset yok, tek inline SVG.
 */

export const STAGES = 6;

/**
 * Çizim sırası: baş, gövde, sol kol, sağ kol, sol bacak, sağ bacak.
 * Her parça "pathLength=1" ile normalize edildiği için uzunluğu ne olursa
 * olsun aynı sürede çiziliyor.
 */
const PARTS = [
  { key: "head", el: <circle cx="168" cy="86" r="19" pathLength="1" /> },
  { key: "body", el: <line x1="168" y1="105" x2="168" y2="164" pathLength="1" /> },
  { key: "arm-l", el: <line x1="168" y1="122" x2="140" y2="146" pathLength="1" /> },
  { key: "arm-r", el: <line x1="168" y1="122" x2="196" y2="146" pathLength="1" /> },
  { key: "leg-l", el: <line x1="168" y1="164" x2="145" y2="202" pathLength="1" /> },
  { key: "leg-r", el: <line x1="168" y1="164" x2="191" y2="202" pathLength="1" /> },
];

export function Gallows({ stage }) {
  const shown = Math.min(STAGES, Math.max(0, stage));

  return (
    <svg
      className={`gallows${shown >= STAGES ? " is-final" : ""}`}
      viewBox="0 0 220 260"
      role="img"
      aria-label="adam asmaca"
    >
      <defs>
        {/* Tebeşirin pütürlü kenarı */}
        <filter id="chalk" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.75"
            numOctaves="3"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="2.4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      <rect className="chalkboard" x="0" y="0" width="220" height="260" rx="10" />

      <g filter="url(#chalk)">
        {/* darağacı — hep görünür */}
        <g className="chalk-frame">
          <line x1="36" y1="242" x2="146" y2="242" /> {/* taban */}
          <line x1="88" y1="242" x2="88" y2="26" />   {/* direk */}
          <line x1="84" y1="26" x2="170" y2="26" />   {/* üst kiriş */}
          <line x1="88" y1="62" x2="124" y2="26" />   {/* payanda */}
          <line x1="168" y1="26" x2="168" y2="67" />  {/* ip */}
        </g>

        {/* adam — her yanlışta bir parça çizilir */}
        <g className="chalk-figure">
          {PARTS.map((part, i) => (
            <g key={part.key} className={`chalk-part${i < shown ? " is-drawn" : ""}`}>
              {part.el}
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
