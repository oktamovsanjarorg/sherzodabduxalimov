import { ERROR_TYPES, countMarks, errorTypeLabel, type EssayAnnotations, type PageAnnotations, type TextMark } from "@onatili/shared";

const W = 1000;
const COLORS = { pen: "#dc2626", marker: "rgba(250, 204, 21, 0.45)" };

/** Ustozning varoq ustidagi chizgilari va xato yorliqlari */
export function PageOverlay({ a, ratio }: { a: PageAnnotations; ratio: number }) {
  const H = W * ratio;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
      {a.strokes.map((s, i) => (
        <polyline
          key={i}
          points={s.points.map(([x, y]) => `${x * W},${y * H}`).join(" ")}
          fill="none"
          stroke={COLORS[s.tool]}
          strokeWidth={s.width * W}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {a.marks.map((m, i) => {
        const x = m.x * W;
        const y = m.y * H;
        const text = `${errorTypeLabel(m.type)}${m.note ? `: ${m.note}` : ""}`;
        const w = Math.min(420, 14 + text.length * 10.5);
        const left = Math.min(x, W - w - 4);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={7} fill="#dc2626" />
            <rect x={left} y={y - 40} width={w} height={28} rx={6} fill="#dc2626" />
            <text x={left + 7} y={y - 20} fontSize={19} fontWeight={700} fill="#fff" fontFamily="system-ui, sans-serif">
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Matn: ustoz belgilagan xatolar qizil chiziq va turi bilan */
export function MarkedText({ text, marks }: { text: string; marks: TextMark[] }) {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const parts: { t: string; m: TextMark | null }[] = [];
  let pos = 0;
  for (const m of sorted) {
    if (m.start < pos) continue;
    if (m.start > pos) parts.push({ t: text.slice(pos, m.start), m: null });
    parts.push({ t: text.slice(m.start, m.end), m });
    pos = m.end;
  }
  if (pos < text.length) parts.push({ t: text.slice(pos), m: null });
  return (
    <p className="whitespace-pre-wrap leading-[2.1]">
      {parts.map((p, i) =>
        p.m ? (
          <span key={i} className="border-b-2 border-danger text-danger">
            {p.t}
            <sup className="ml-0.5 rounded bg-danger px-1 text-[10px] font-bold text-white">
              {errorTypeLabel(p.m.type)}
              {p.m.note ? `: ${p.m.note}` : ""}
            </sup>
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </p>
  );
}

/** Belgilangan xatolar soni turlari bo'yicha */
export function MarksLegend({ a }: { a: EssayAnnotations | { pages: PageAnnotations[]; text: TextMark[] } }) {
  const c = countMarks(a as EssayAnnotations);
  const items = ERROR_TYPES.filter((t) => c[t.key]);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t.key} className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-bold text-danger">
          {t.label}: {c[t.key]}
        </span>
      ))}
    </div>
  );
}
