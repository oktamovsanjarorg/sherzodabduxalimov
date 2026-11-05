import { ERROR_TYPES, errorTypeLabel, type ErrorTypeKey, type PageAnnotations, type PageMark, type Stroke, type TextMark } from "@onatili/shared";
import { Eraser, Hand, Highlighter, Pen, Tag, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";

const W = 1000; // SVG koordinatalari: rasm kengligi = 1000
const COLORS = { pen: "#dc2626", marker: "rgba(250, 204, 21, 0.45)" };

/** Varoq rasmi ustidagi chizgilar va xato yorliqlari (faqat ko'rsatish) */
export function AnnotationOverlay({ a, ratio }: { a: PageAnnotations; ratio: number }) {
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
      {a.marks.map((m, i) => (
        <MarkLabel key={i} m={m} H={H} />
      ))}
    </svg>
  );
}

function MarkLabel({ m, H }: { m: PageMark; H: number }) {
  const x = m.x * W;
  const y = m.y * H;
  const text = `${errorTypeLabel(m.type)}${m.note ? `: ${m.note}` : ""}`;
  const w = Math.min(420, 14 + text.length * 10.5);
  const left = Math.min(x, W - w - 4);
  return (
    <g>
      <circle cx={x} cy={y} r={7} fill="#dc2626" />
      <rect x={left} y={y - 40} width={w} height={28} rx={6} fill="#dc2626" />
      <text x={left + 7} y={y - 20} fontSize={19} fontWeight={700} fill="#fff" fontFamily="system-ui, sans-serif">
        {text}
      </text>
    </g>
  );
}

/** Belgilangan xatolar turlari bo'yicha soni */
export function MarkCounts({ counts }: { counts: Record<string, number> }) {
  const items = ERROR_TYPES.filter((t) => counts[t.key]);
  if (!items.length) return <p className="text-xs text-slate-400">Hali xato belgilanmagan</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t.key} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
          {t.label}: {counts[t.key]}
        </span>
      ))}
    </div>
  );
}

type Tool = "pen" | "marker" | "mark" | "erase" | "hand";

/** Chizgini soddalashtirish: bir-biriga juda yaqin nuqtalar tashlanadi, 4 xonagacha yaxlitlanadi (JSON kichik bo'lsin) */
function simplify(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.0015) out.push([Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]);
  }
  return out;
}

/**
 * Varoq rasmini belgilash: qizil qalam (tagiga chizish, doiraga olish), sariq marker, xato yorlig'i
 * (turini tanlab so'z ustiga bosiladi), o'chirg'ich (chizgi yoki yorliq ustiga bosiladi), qo'l (siljitish).
 */
export function PageAnnotator({ src, value, onChange }: { src: string; value: PageAnnotations; onChange: (v: PageAnnotations) => void }) {
  const [tool, setTool] = useState<Tool>("pen");
  const [type, setType] = useState<ErrorTypeKey>("spelling");
  const [note, setNote] = useState("");
  const [zoom, setZoom] = useState(1);
  const [ratio, setRatio] = useState(1.4);
  const [draft, setDraft] = useState<[number, number][] | null>(null);
  const [history, setHistory] = useState<PageAnnotations[]>([]);
  const box = useRef<HTMLDivElement>(null);

  const commit = (next: PageAnnotations) => {
    setHistory((h) => [...h.slice(-49), value]);
    onChange(next);
  };
  const pos = (e: RPointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))] as [number, number];
  };
  const width = tool === "marker" ? 0.022 : 0.004;

  const down = (e: RPointerEvent) => {
    if (tool === "hand") return;
    e.preventDefault();
    const p = pos(e);
    if (tool === "mark") {
      commit({ ...value, marks: [...value.marks, { x: p[0], y: p[1], type, note: note.trim() || null }] });
      setNote("");
      return;
    }
    if (tool === "erase") {
      // Eng yaqin chizgi yoki yorliq (rasm kengligining 2% radiusida) o'chiriladi
      const d = (a: [number, number]) => Math.hypot(a[0] - p[0], (a[1] - p[1]) * ratio);
      const mi = value.marks.findIndex((m) => d([m.x, m.y]) < 0.03);
      if (mi >= 0) return commit({ ...value, marks: value.marks.filter((_, i) => i !== mi) });
      const si = value.strokes.findIndex((s) => s.points.some((q) => d(q) < 0.02));
      if (si >= 0) commit({ ...value, strokes: value.strokes.filter((_, i) => i !== si) });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft([p]);
  };
  const move = (e: RPointerEvent) => {
    if (!draft) return;
    setDraft((d) => (d ? [...d, pos(e)] : d));
  };
  const up = () => {
    if (!draft) return;
    const points = simplify(draft);
    setDraft(null);
    if (tool === "pen" || tool === "marker") commit({ ...value, strokes: [...value.strokes, { tool, width, points: points.length > 1 ? points : [points[0], points[0]] } as Stroke] });
  };

  const live = useMemo<PageAnnotations>(
    () => (draft && (tool === "pen" || tool === "marker") ? { ...value, strokes: [...value.strokes, { tool, width, points: draft }] } : value),
    [draft, value, tool, width],
  );

  const tools: { k: Tool; label: string; Icon: typeof Pen }[] = [
    { k: "pen", label: "Qalam", Icon: Pen },
    { k: "marker", label: "Marker", Icon: Highlighter },
    { k: "mark", label: "Xato belgisi", Icon: Tag },
    { k: "erase", label: "O'chirg'ich", Icon: Eraser },
    { k: "hand", label: "Siljitish", Icon: Hand },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        {tools.map(({ k, label, Icon }) => (
          <button
            key={k}
            type="button"
            onClick={() => setTool(k)}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${tool === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <button type="button" className="btn-ghost h-9 w-9 p-0" disabled={!history.length} onClick={() => (onChange(history[history.length - 1]), setHistory((h) => h.slice(0, -1)))} aria-label="Bekor qilish">
          <Undo2 size={16} />
        </button>
        <button type="button" className="btn-ghost h-9 w-9 p-0" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Kichraytirish">
          <ZoomOut size={16} />
        </button>
        <span className="w-10 text-center text-xs font-bold text-slate-500">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn-ghost h-9 w-9 p-0" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} aria-label="Kattalashtirish">
          <ZoomIn size={16} />
        </button>
        <button type="button" className="ml-auto text-xs font-semibold text-red-600 hover:underline" onClick={() => commit({ strokes: [], marks: [] })}>
          Varoqni tozalash
        </button>
      </div>
      {tool === "mark" && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 py-2">
          {ERROR_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${type === t.key ? "border-red-600 bg-red-600 text-white" : "border-slate-200 text-slate-700"}`}
            >
              {t.label}
            </button>
          ))}
          <input className="input h-8 w-56 text-xs" placeholder="To'g'risi / izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
          <span className="text-xs text-slate-500">so'ng xato ustiga bosing</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-2">
        <div ref={box} className="relative mx-auto select-none" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? 900 : undefined }}>
          <img src={src} alt="" draggable={false} className="block w-full" onLoad={(e) => setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth || 1.4)} />
          <AnnotationOverlay a={live} ratio={ratio} />
          <div
            className="absolute inset-0"
            style={{ touchAction: tool === "hand" ? "auto" : "none", cursor: tool === "hand" ? "grab" : tool === "erase" ? "cell" : "crosshair", pointerEvents: tool === "hand" ? "none" : "auto" }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
      </div>
    </div>
  );
}

/** Matndagi belgilangan qismlar bo'yicha bo'laklash (ko'rsatish uchun) */
export function segments(text: string, marks: TextMark[]) {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const out: { text: string; mark: TextMark | null; idx: number }[] = [];
  let pos = 0;
  sorted.forEach((m) => {
    if (m.start < pos) return; // ustma-ust tushganini o'tkazib yuboramiz
    if (m.start > pos) out.push({ text: text.slice(pos, m.start), mark: null, idx: -1 });
    out.push({ text: text.slice(m.start, m.end), mark: m, idx: marks.indexOf(m) });
    pos = m.end;
  });
  if (pos < text.length) out.push({ text: text.slice(pos), mark: null, idx: -1 });
  return out;
}

/** Belgilangan elementgacha bo'lgan matn uzunligi (tanlash chegaralarini hisoblash uchun) */
function offsetIn(root: HTMLElement, node: Node, offset: number) {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

/**
 * Yozilgan esse matnida xatolarni belgilash: so'zni sichqoncha/barmoq bilan belgilang -> xato turini tanlang.
 * Belgini o'chirish uchun ustiga bosing.
 */
export function TextAnnotator({ text, value, onChange }: { text: string; value: TextMark[]; onChange: (v: TextMark[]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [note, setNote] = useState("");
  const pick = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !ref.current || !ref.current.contains(s.anchorNode)) return setSel(null);
    const r = s.getRangeAt(0);
    let start = offsetIn(ref.current, r.startContainer, r.startOffset);
    let end = offsetIn(ref.current, r.endContainer, r.endOffset);
    // Bo'sh joylarni chetlab o'tamiz
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    setSel(end > start ? { start, end } : null);
  };
  const add = (type: ErrorTypeKey) => {
    if (!sel) return;
    const overlap = value.some((m) => m.start < sel.end && sel.start < m.end);
    onChange([...value.filter((m) => !(overlap && m.start < sel.end && sel.start < m.end)), { ...sel, type, note: note.trim() || null }]);
    setSel(null);
    setNote("");
    window.getSelection()?.removeAllRanges();
  };
  return (
    <div>
      <div className={`sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border p-2 ${sel ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
        {sel ? (
          <>
            <span className="text-xs font-bold text-red-700">«{text.slice(sel.start, sel.end).slice(0, 40)}» —</span>
            {ERROR_TYPES.map((t) => (
              <button key={t.key} type="button" className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700" onClick={() => add(t.key)}>
                {t.label}
              </button>
            ))}
            <input className="input h-7 w-44 text-xs" placeholder="To'g'risi (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
          </>
        ) : (
          <span className="text-xs text-slate-500">Xato so'z yoki qismni belgilang, so'ng turini tanlang. Belgini o'chirish uchun ustiga bosing.</span>
        )}
      </div>
      <div ref={ref} onMouseUp={pick} onTouchEnd={() => setTimeout(pick, 50)} className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-[15px] leading-[2.1]">
        {segments(text, value).map((s, i) =>
          s.mark ? (
            <span
              key={i}
              title={`${errorTypeLabel(s.mark.type)}${s.mark.note ? `: ${s.mark.note}` : ""} — o'chirish uchun bosing`}
              onClick={() => onChange(value.filter((_, j) => j !== s.idx))}
              // Yorliq CSS orqali (::after): DOM matni o'zgarmaydi, keyingi belgilarning o'rni to'g'ri hisoblanadi
              data-short={ERROR_TYPES.find((t) => t.key === s.mark!.type)?.short}
              className="relative cursor-pointer border-b-2 border-red-600 text-red-700 after:ml-0.5 after:rounded after:bg-red-600 after:px-1 after:align-super after:text-[10px] after:font-bold after:text-white after:content-[attr(data-short)]"
            >
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
    </div>
  );
}
