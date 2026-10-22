/**
 * Line-art "engravings" in the spirit of the reference's antique plates (the greyhound, the
 * crown). Drawn with strokes + hatching in currentColor, so they sit on red, paper or ink.
 */

import { HEART_PATH } from '@/lib/attendance/calc';

type Props = { className?: string; title?: string };

function Hatch({ id, angle = 0, gap = 3, width = 0.6 }: { id: string; angle?: number; gap?: number; width?: number }) {
  return (
    <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
      <line x1="0" y1="0" x2="0" y2={gap} stroke="currentColor" strokeWidth={width} />
    </pattern>
  );
}

export function Crown({ className, title = 'Crown engraving' }: Props) {
  return (
    <svg className={className} viewBox="0 0 120 74" fill="none" role="img" aria-label={title}>
      <defs>
        <Hatch id="crown-h" angle={0} gap={2.6} width={0.55} />
        <Hatch id="crown-b" angle={90} gap={2.2} width={0.5} />
      </defs>
      <g stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
        <path d="M15 54 L8 25 L21 41 L34 15 L47 41 L60 7 L73 41 L86 15 L99 41 L112 25 L105 54 Z" fill="url(#crown-h)" />
        <path d="M15 54 L8 25 L21 41 L34 15 L47 41 L60 7 L73 41 L86 15 L99 41 L112 25 L105 54" />
        <path d="M13 54 H107 L105 66 H15 Z" fill="url(#crown-b)" />
        <path d="M13 54 H107 M15 66 H105" strokeWidth="1.4" />
        <circle cx="8" cy="24" r="3" fill="currentColor" />
        <circle cx="34" cy="13.5" r="3.4" fill="currentColor" />
        <circle cx="60" cy="5" r="3.8" fill="currentColor" />
        <circle cx="86" cy="13.5" r="3.4" fill="currentColor" />
        <circle cx="112" cy="24" r="3" fill="currentColor" />
      </g>
      <g fill="currentColor">
        <path d="M60 55.5 l3.5 4.5 -3.5 4.5 -3.5 -4.5 z" />
        <circle cx="40" cy="60" r="2.4" />
        <circle cx="80" cy="60" r="2.4" />
        <circle cx="24" cy="60" r="1.6" />
        <circle cx="96" cy="60" r="1.6" />
        <path d="M60 24 l4 6 -4 6 -4 -6 z" />
        <circle cx="34" cy="36" r="2" />
        <circle cx="86" cy="36" r="2" />
      </g>
    </svg>
  );
}

/** A small temple: "our own building, outside the academic block". */
export function Pavilion({ className, title = 'Pavilion engraving' }: Props) {
  const cols = [22, 41, 60, 79, 98];
  return (
    <svg className={className} viewBox="0 0 120 92" fill="none" role="img" aria-label={title}>
      <defs>
        <Hatch id="pav-wall" angle={35} gap={2.4} width={0.55} />
        <Hatch id="pav-ped" angle={0} gap={2.4} width={0.5} />
        <Hatch id="pav-step" angle={90} gap={2} width={0.45} />
      </defs>
      <g stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
        {/* back wall in shadow */}
        <rect x="14" y="38" width="92" height="36" fill="url(#pav-wall)" stroke="none" />
        {/* pediment */}
        <path d="M8 31 L60 6 L112 31 Z" />
        <path d="M22 28 L60 11 L98 28 Z" fill="url(#pav-ped)" />
        <circle cx="60" cy="21.5" r="3" fill="currentColor" />
        {/* entablature */}
        <rect x="11" y="31" width="98" height="7" />
        <path d="M11 34.5 H109" strokeWidth="0.7" />
        {/* columns */}
        {cols.map((x) => (
          <g key={x}>
            <rect x={x - 5.5} y="38" width="11" height="3" fill="var(--engrave-bg, transparent)" />
            <rect x={x - 4} y="41" width="8" height="30" fill="var(--engrave-bg, transparent)" />
            <path d={`M${x - 1.4} 42 V70 M${x + 1.4} 42 V70`} strokeWidth="0.6" />
            <rect x={x - 5.5} y="71" width="11" height="3" fill="var(--engrave-bg, transparent)" />
          </g>
        ))}
        {/* steps */}
        <rect x="8" y="74" width="104" height="5" fill="url(#pav-step)" />
        <rect x="4" y="79" width="112" height="5" />
        <rect x="0" y="84" width="120" height="5" fill="url(#pav-step)" />
      </g>
    </svg>
  );
}

export function Hourglass({ className, title = 'Hourglass engraving' }: Props) {
  return (
    <svg className={className} viewBox="0 0 80 120" fill="none" role="img" aria-label={title}>
      <defs>
        <Hatch id="hg-sand" angle={0} gap={2} width={0.6} />
        <Hatch id="hg-wood" angle={90} gap={2.2} width={0.5} />
      </defs>
      <g stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
        <rect x="6" y="6" width="68" height="8" rx="1" fill="url(#hg-wood)" />
        <rect x="6" y="106" width="68" height="8" rx="1" fill="url(#hg-wood)" />
        <path d="M12 14 V106 M68 14 V106" strokeWidth="1.6" />
        <path d="M18 14 C18 40 36 50 38 60 C36 70 18 80 18 106 H62 C62 80 44 70 42 60 C44 50 62 40 62 14 Z" />
        <path d="M24 26 C27 40 37 48 39 56 H41 C43 48 53 40 56 26 Z" fill="url(#hg-sand)" stroke="none" />
        <path d="M40 60 V96" strokeWidth="0.8" strokeDasharray="1.5 2.5" />
        <path d="M22 106 C26 94 34 90 40 89 C46 90 54 94 58 106 Z" fill="url(#hg-sand)" />
      </g>
    </svg>
  );
}

/** A heart-shaped locket on its bail — the Attendance tab's plate. */
export function Locket({ className, title = 'Locket engraving' }: Props) {
  // The heart path (48×44 box) scaled ×2.2 and centred on (60, 66); the inner contour at ×1.9.
  const outer = 'translate(7.2 17.6) scale(2.2)';
  const inner = 'translate(14.4 24.2) scale(1.9)';
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" role="img" aria-label={title}>
      <defs>
        <Hatch id="locket-h" angle={45} gap={1.2} width={0.28} />
        <Hatch id="locket-b" angle={-45} gap={1.05} width={0.24} />
      </defs>
      <g stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
        {/* bail */}
        <circle cx="60" cy="14" r="6" />
        <circle cx="60" cy="14" r="3.2" strokeWidth="0.7" />
        <path d="M57.6 19.6 C57.8 24 58.6 30 60 37.4 C61.4 30 62.2 24 62.4 19.6" fill="url(#locket-b)" />
        {/* the rim: double contour, hatched between */}
        <path d={HEART_PATH} transform={outer} vectorEffect="non-scaling-stroke" fill="url(#locket-b)" />
        <path d={HEART_PATH} transform={inner} vectorEffect="non-scaling-stroke" fill="var(--engrave-bg, var(--paper))" />
        {/* the face: shade on the lower right, glint on the upper left */}
        <path
          d="M46 14 C46 24 38 32 24 42 C33.5 33 40.5 25 41.4 15.5 C41.8 10.8 39.8 6.6 36.5 4.3 C42 5.2 46 9.2 46 14 Z"
          transform={inner}
          fill="url(#locket-h)"
          stroke="none"
        />
        <path d="M8.5 14 C8.7 9.8 11.2 7.2 14.8 6.8" transform={inner} vectorEffect="non-scaling-stroke" strokeWidth="1.4" />
        {/* keyhole */}
        <circle cx="60" cy="58" r="4" fill="currentColor" />
        <path d="M58 61 h4 l1.5 10 h-7 z" fill="currentColor" />
      </g>
    </svg>
  );
}

/** Laurel sprig — used as a flourish beside headings. */
export function Laurel({ className, title = 'Laurel engraving' }: Props) {
  const leaves = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg className={className} viewBox="0 0 140 40" fill="none" role="img" aria-label={title}>
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        <path d="M6 30 C40 22 90 18 134 20" />
        {leaves.map((i) => {
          const x = 18 + i * 16;
          const y = 27 - i * 1.1;
          return (
            <g key={i}>
              <path d={`M${x} ${y} c4 -9 11 -11 16 -11 c-3 6 -9 11 -16 11z`} fill="currentColor" fillOpacity="0.85" />
              <path d={`M${x + 2} ${y + 1} c6 6 12 7 16 6 c-4 -5 -10 -7 -16 -6z`} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
