import {
  ESSAY_MAX_SCORE,
  ESSAY_STATUS_LABELS,
  type AdminEssayLogRow,
  type AdminEssayStats,
  type EssayReviewView,
  type EssayScoreStats,
  type EssayStatsPeriod,
  formatScore,
} from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronRight, ImageOff, Search, UserCheck } from "lucide-react";
import { useState } from "react";
import { Badge, Chips, Empty, Modal, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { fmtDateTime, fmtShortDateTime } from "../lib/format";

const PERIODS = [
  [7, "7 kun"],
  [30, "30 kun"],
  [90, "90 kun"],
  [0, "Hammasi"],
] as const satisfies readonly (readonly [EssayStatsPeriod, string])[];

const periodKey = (p: EssayStatsPeriod) => String(p) as `${EssayStatsPeriod}`;
const PERIOD_OPTIONS = PERIODS.map(([d, l]) => [periodKey(d), l] as const);

/** Ballga qarab rang: 18+ yaxshi, 12+ o'rtacha, undan pasti zaif (24 ballik mezon) */
const scoreTone = (s: number) => (s >= 18 ? "green" : s >= 12 ? "blue" : s >= 6.5 ? "amber" : "red");
const AI_COLOR = "#4a86f7";
const TEACHER_COLOR = "#f0a63a";

function Period({ value, onChange }: { value: EssayStatsPeriod; onChange: (p: EssayStatsPeriod) => void }) {
  return <Chips className="mb-4" value={periodKey(value)} onChange={(v) => onChange(Number(v) as EssayStatsPeriod)} options={PERIOD_OPTIONS} />;
}

// ===================== Statistika =====================

export function EssayStats() {
  const [days, setDays] = useState<EssayStatsPeriod>(30);
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["essay-stats", days], queryFn: () => api.essayStats(days) });
  const s = q.data;
  return (
    <>
      <Period value={days} onChange={setDays} />
      {q.isPending && <Spinner className="text-ink-4" />}
      {s && s.totals.essays === 0 && <Empty title="Bu davrda esse yuborilmagan" />}
      {s && s.totals.essays > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Yuborilgan esselar" value={s.totals.essays} hint={`${s.totals.students} ta o'quvchi`} />
            <Tile
              label="AI tekshirdi"
              value={s.totals.aiChecked}
              hint={s.totals.aiFailed ? `${s.totals.aiFailed} tasini tekshira olmadi` : `${s.totals.ai} ta yuborilgan`}
            />
            <Tile label="AI o'rtacha bali" value={s.ai.avg != null ? `${formatScore(s.ai.avg)} / ${ESSAY_MAX_SCORE}` : "—"} hint={`${s.ai.count} ta baho`} />
            <Tile
              label="Ustoz tekshiruvi"
              value={s.totals.teacherReviewed}
              hint={`${s.totals.teacherWaiting} ta kutmoqda${s.teacher.avg != null ? ` · o'rtacha ${formatScore(s.teacher.avg)}` : ""}`}
            />
          </div>

          <section className="card p-4 sm:p-5">
            <h2 className="mb-3 font-extrabold">Kunlar bo'yicha</h2>
            <DailyChart daily={s.daily} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <CriteriaCard title="AI bahosi: 12 band bo'yicha o'rtacha" stats={s.ai} />
            {s.teacher.count > 0 ? (
              <CriteriaCard title="Ustoz bahosi: 12 band bo'yicha o'rtacha" stats={s.teacher} />
            ) : (
              <section className="card p-4 sm:p-5">
                <h2 className="mb-3 font-extrabold">AI ballari taqsimoti</h2>
                <Buckets stats={s.ai} />
              </section>
            )}
          </div>

          {s.teacher.count > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card p-4 sm:p-5">
                <h2 className="mb-3 font-extrabold">AI ballari taqsimoti</h2>
                <Buckets stats={s.ai} />
              </section>
              <section className="card p-4 sm:p-5">
                <h2 className="mb-3 font-extrabold">Ustoz ballari taqsimoti</h2>
                <Buckets stats={s.teacher} />
              </section>
            </div>
          )}

          {(s.specials.length > 0 || s.providers.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {s.specials.length > 0 && (
                <section className="card p-4 sm:p-5">
                  <h2 className="mb-1 font-extrabold">AI baholamagan holatlar</h2>
                  <p className="mb-3 text-xs text-ink-3">Mezon bo'yicha bunday essega qat'iy 2 yoki 0 ball qo'yiladi</p>
                  <ul className="space-y-1.5 text-sm">
                    {s.specials.map((x) => (
                      <li key={x.key} className="flex justify-between gap-3">
                        <span className="text-ink-2">{x.label}</span>
                        <b>{x.count}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {s.providers.length > 0 && (
                <section className="card p-4 sm:p-5">
                  <h2 className="mb-3 font-extrabold">Qaysi AI tekshirdi</h2>
                  <ul className="space-y-1.5 text-sm">
                    {s.providers.map((x) => (
                      <li key={x.provider} className="flex justify-between gap-3">
                        <span className="capitalize text-ink-2">{x.provider}</span>
                        <b>{x.count}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          <TopStudents rows={s.topStudents} onOpen={setOpenStudent} />
        </div>
      )}
      {openStudent && <StudentEssaysModal studentId={openStudent} days={days} onClose={() => setOpenStudent(null)} rows={s?.topStudents ?? []} />}
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function DailyChart({ daily }: { daily: AdminEssayStats["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.ai + d.teacher));
  const sel = daily[hover ?? daily.length - 1];
  const label = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  return (
    <div>
      <div className="mb-3 flex min-h-[36px] flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <b>{sel && label(sel.date)}</b>
        <Legend color={AI_COLOR} text={`AI: ${sel?.ai ?? 0}`} />
        <Legend color={TEACHER_COLOR} text={`Ustoz: ${sel?.teacher ?? 0}`} />
      </div>
      <div className="flex h-36 items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)}>
        {daily.map((d, i) => (
          <button
            key={d.date}
            type="button"
            className={`flex h-full min-w-0 flex-1 flex-col justify-end rounded-t ${hover === i ? "bg-surface-2" : ""}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${label(d.date)}: AI ${d.ai}, ustoz ${d.teacher}`}
          >
            <div className="flex w-full flex-col-reverse" style={{ height: `${((d.ai + d.teacher) / max) * 100}%` }}>
              {d.ai > 0 && <div style={{ flexGrow: d.ai, background: AI_COLOR, minHeight: 2 }} />}
              {d.teacher > 0 && <div className="rounded-t-sm" style={{ flexGrow: d.teacher, background: TEACHER_COLOR, minHeight: 2 }} />}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-4">
        <span>{daily[0] && label(daily[0].date)}</span>
        <span>{daily.at(-1) && label(daily.at(-1)!.date)}</span>
      </div>
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {text}
    </span>
  );
}

function CriteriaCard({ title, stats }: { title: string; stats: EssayScoreStats }) {
  const weakest = [...stats.criteria].sort((a, b) => a.avg / a.max - b.avg / b.max).slice(0, 3).map((c) => c.key);
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-1 font-extrabold">{title}</h2>
      <p className="mb-3 text-xs text-ink-3">Har band 2 balldan. Eng zaif 3 band sariq bilan belgilangan: darsda shularga e'tibor bering</p>
      {stats.criteria.length === 0 ? (
        <p className="text-sm text-ink-3">Bandlar bo'yicha baholangan esse yo'q</p>
      ) : (
        <ul className="space-y-2">
          {stats.criteria.map((c) => {
            const weak = weakest.includes(c.key);
            return (
              <li key={c.key} className="text-sm">
                <div className="mb-1 flex justify-between gap-3">
                  <span className={weak ? "font-bold text-amber-700" : "text-ink-2"}>{c.label}</span>
                  <b className={weak ? "text-amber-700" : ""}>
                    {formatScore(c.avg)} / {c.max}
                  </b>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className={`h-full rounded-full ${weak ? "bg-amber-400" : "bg-brand"}`} style={{ width: `${(c.avg / c.max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Buckets({ stats }: { stats: EssayScoreStats }) {
  const max = Math.max(1, ...stats.buckets.map((b) => b.count));
  return (
    <ul className="space-y-2">
      {stats.buckets.map((b) => (
        <li key={b.label} className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-ink-2">{b.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-surface-3">
            <div className="h-full rounded bg-brand/80" style={{ width: `${(b.count / max) * 100}%` }} />
          </div>
          <b className="w-8 text-right">{b.count}</b>
        </li>
      ))}
    </ul>
  );
}

function TopStudents({ rows, onOpen }: { rows: AdminEssayStats["topStudents"]; onOpen: (id: string) => void }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="px-4 pt-4 font-extrabold sm:px-5">Eng faol o'quvchilar</h2>
      <p className="px-4 pb-3 text-xs text-ink-3 sm:px-5">Bosing: o'quvchining barcha esselari va baholari</p>
      <ul className="divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <li key={r.id}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 sm:px-5" onClick={() => onOpen(r.id)}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.name}</p>
                <p className="truncate text-xs text-ink-3">
                  {r.username ? `@${r.username} · ` : ""}oxirgisi {fmtShortDateTime(r.lastAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <Badge tone="gray">{r.essays} ta esse</Badge>
                {r.aiAvg != null && <Badge tone={scoreTone(r.aiAvg)}>AI {formatScore(r.aiAvg)}</Badge>}
                {r.teacherAvg != null && <Badge tone={scoreTone(r.teacherAvg)}>Ustoz {formatScore(r.teacherAvg)}</Badge>}
              </div>
              <ChevronRight size={16} className="shrink-0 text-ink-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StudentEssaysModal({ studentId, days, rows, onClose }: { studentId: string; days: EssayStatsPeriod; rows: AdminEssayStats["topStudents"]; onClose: () => void }) {
  const st = rows.find((r) => r.id === studentId);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["essay-log", days, "student", studentId], queryFn: () => api.essayLog(days, "", "", studentId) });
  const list = q.data;
  return (
    <Modal wide title={st?.name ?? "O'quvchi"} onClose={onClose}>
      {q.isPending && <Spinner className="text-ink-4" />}
      <LogList rows={list ?? []} onOpen={setOpen} hideStudent />
      {open && <EssayDetailModal id={open} onClose={() => setOpen(null)} />}
    </Modal>
  );
}

// ===================== Jurnal =====================

export function EssayLog() {
  const [days, setDays] = useState<EssayStatsPeriod>(30);
  const [mode, setMode] = useState<"" | "AI" | "TEACHER">("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["essay-log", days, mode, q.trim()], queryFn: () => api.essayLog(days, mode, q.trim()), placeholderData: (p) => p });
  return (
    <>
      <Period value={days} onChange={setDays} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input className="input pl-9" placeholder="O'quvchi ismi, @username yoki mavzu" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Chips
          value={mode || "ALL"}
          onChange={(v) => setMode(v === "ALL" ? "" : v)}
          options={[["ALL", "Hammasi"], ["AI", "AI"], ["TEACHER", "Ustoz"]] as const}
        />
      </div>
      {list.isPending && <Spinner className="text-ink-4" />}
      {list.data?.length === 0 && <Empty title="Esse topilmadi" hint="Davrni kengaytiring yoki qidiruvni o'zgartiring." />}
      {list.data && list.data.length > 0 && (
        <>
          <p className="mb-2 text-xs text-ink-3">{list.data.length === 300 ? "Oxirgi 300 ta esse" : `${list.data.length} ta esse`}</p>
          <LogList rows={list.data} onOpen={setOpen} />
        </>
      )}
      {open && <EssayDetailModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function LogList({ rows, onOpen, hideStudent }: { rows: AdminEssayLogRow[]; onOpen: (id: string) => void; hideStudent?: boolean }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <button key={r.id} onClick={() => onOpen(r.id)} className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-brand sm:p-4">
          <span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:flex ${r.mode === "AI" ? "bg-brand-soft text-brand-dark" : "bg-amber-100 text-amber-800"}`}>
            {r.mode === "AI" ? <Bot size={18} /> : <UserCheck size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            {!hideStudent && (
              <p className="break-words font-bold sm:truncate">
                {r.student.name}
                {r.student.username && <span className="ml-1.5 text-xs font-normal text-ink-3">@{r.student.username}</span>}
              </p>
            )}
            <p className={`truncate text-sm ${hideStudent ? "font-semibold" : "text-ink-2"}`}>«{r.prompt}»</p>
            <p className="truncate text-xs text-ink-3">
              {fmtShortDateTime(r.createdAt)} · {r.words != null ? `${r.words} so'z` : `${r.pages} varoq`}
              {r.ai?.provider ? ` · ${r.ai.provider}` : ""}
              {r.teacher?.reviewer ? ` · tekshirdi: ${r.teacher.reviewer}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {r.ai && <Badge tone={scoreTone(r.ai.score)}>AI {formatScore(r.ai.score)}/{ESSAY_MAX_SCORE}</Badge>}
            {r.teacher && <Badge tone={scoreTone(r.teacher.score)}>Ustoz {formatScore(r.teacher.score)}/{ESSAY_MAX_SCORE}</Badge>}
            {!r.ai && !r.teacher && <Badge tone={r.status === "AI_FAILED" ? "red" : "gray"}>{ESSAY_STATUS_LABELS[r.status]}</Badge>}
            {(r.ai?.special || r.teacher?.special) && <span className="text-[11px] font-semibold text-amber-800">{r.teacher?.special ?? r.ai?.special}</span>}
          </div>
          <ChevronRight size={16} className="shrink-0 text-ink-4" />
        </button>
      ))}
    </div>
  );
}

// ===================== Bitta esse: to'liq tafsilot =====================

function EssayDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["essay-detail", id], queryFn: () => api.essayDetail(id) });
  const e = q.data;
  const ai = e?.reviews.find((r) => r.source === "AI");
  const teacher = e?.reviews.find((r) => r.source === "TEACHER");
  return (
    <Modal wide title={e ? e.student.name : "Esse"} onClose={onClose}>
      {q.isPending && <Spinner className="text-ink-4" />}
      {e && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <Badge tone={e.mode === "AI" ? "brand" : "amber"}>{e.mode === "AI" ? "AI tekshiruvi" : "Ustoz tekshiruvi"}</Badge>
              <Badge tone="gray">{ESSAY_STATUS_LABELS[e.status]}</Badge>
              <span>{fmtDateTime(e.createdAt)}</span>
              {e.student.username && <span>@{e.student.username}</span>}
            </div>
            <p className="text-sm">
              <span className="text-ink-3">Mavzu:</span> <b className="whitespace-pre-wrap">{e.prompt}</b>
            </p>
            {Array.from({ length: e.pages }, (_, n) => (
              <div key={n}>
                <p className="mb-1 text-xs font-bold text-ink-4">{n + 1}-varoq</p>
                <PageImage id={e.id} n={n} />
              </div>
            ))}
            {e.text && <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">{e.text}</p>}
          </div>
          <div className="space-y-4">
            {!ai && !teacher && (
              <p className={`rounded-lg p-3 text-sm ${e.error ? "border border-red-200 bg-red-50 text-red-700" : "bg-surface-2 text-ink-3"}`}>
                {e.error ? `AI tekshira olmadi: ${e.error}` : "Hali baholanmagan"}
              </p>
            )}
            {teacher && <ReviewBlock r={teacher} />}
            {ai && <ReviewBlock r={ai} />}
          </div>
        </div>
      )}
    </Modal>
  );
}

function PageImage({ id, n }: { id: string; n: number }) {
  const img = useQuery({ queryKey: ["essay-page", id, n], queryFn: () => api.essayPage(id, n), staleTime: Infinity, gcTime: 10 * 60_000 });
  if (img.isPending) return <div className="flex h-48 items-center justify-center rounded-xl bg-surface-3"><Spinner className="text-ink-4" /></div>;
  if (!img.data) return <div className="flex h-20 items-center justify-center gap-2 rounded-xl bg-surface-3 text-sm text-ink-3"><ImageOff size={16} /> Rasm yuklanmadi</div>;
  return <img src={img.data} alt={`${n + 1}-varoq`} className="w-full rounded-xl" />;
}

function ReviewBlock({ r }: { r: EssayReviewView }) {
  const isAi = r.source === "AI";
  return (
    <section className="rounded-xl border border-line p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isAi ? "bg-brand-soft text-brand-dark" : "bg-amber-100 text-amber-800"}`}>
          {isAi ? <Bot size={16} /> : <UserCheck size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{isAi ? "AI bahosi" : `Ustoz bahosi${r.reviewer ? ` · ${r.reviewer}` : ""}`}</p>
          <p className="text-xs text-ink-3">{fmtDateTime(r.createdAt)}</p>
        </div>
        <Badge tone={scoreTone(r.totalScore)}>
          {formatScore(r.totalScore)} / {r.maxScore}
        </Badge>
      </div>
      {r.special && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Baholanmadi: {r.special.label}</p>}
      {r.criteria.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {r.criteria.map((c) => (
            <li key={c.key} className="px-3 py-2">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{c.label}</span>
                <b className={c.score < c.max / 2 ? "text-red-600" : c.score < c.max ? "text-amber-700" : "text-emerald-700"}>
                  {formatScore(c.score)} / {c.max}
                </b>
              </div>
              {c.comment && <p className="mt-0.5 text-xs text-ink-3">{c.comment}</p>}
            </li>
          ))}
        </ul>
      )}
      {r.feedback && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-3">Umumiy xulosa</p>
          <p className="whitespace-pre-wrap text-sm text-ink-2">{r.feedback}</p>
        </div>
      )}
      {r.mistakes.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-3">Topilgan xatolar ({r.mistakes.length})</p>
          <ul className="space-y-1.5 text-sm">
            {r.mistakes.map((m, i) => (
              <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">
                <span className="text-red-600 line-through">{m.wrong}</span> → <span className="font-semibold text-emerald-700">{m.right}</span>
                {m.note && <p className="mt-0.5 text-xs text-ink-3">{m.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.tips.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-3">Tavsiyalar</p>
          <ul className="space-y-1.5 text-sm">
            {r.tips.map((t, i) => (
              <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">
                {t.focus && <b className="block text-ink">{t.focus}</b>}
                <span className="text-ink-2">{t.text}</span>
                {t.example && <p className="mt-1 border-l-2 border-brand pl-2 text-xs italic text-ink-3">{t.example}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
