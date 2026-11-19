import { MILLIY_LEVELS, RASCH_MIN_SAMPLE, type ExternalPreview, type ExternalTestDetail, formatScore } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileSpreadsheet, FileText, FileUp, Link2, PenLine, Send, Trash2, Trophy, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Chips, ConfirmButton, Empty, Field, Modal, PageHeader, Segmented, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useToast } from "../lib/toast";
import { EssayModal } from "./ExternalEssayModal";
import { RaschCard, ResultCardModal, questionsLabel } from "./ExternalMilliy";

const tone = (p: number) => (p >= 80 ? "green" : p >= 60 ? "blue" : p >= 40 ? "amber" : "red");
const HOW = { username: "username", name: "ism bo'yicha" } as const;

/** Offline testlar: import, tahlil, reyting */
export function ExternalTestsPage() {
  const [tab, setTab] = useState<"tests" | "ranking">("tests");
  const [importing, setImporting] = useState(false);
  const q = useQuery({ queryKey: ["external"], queryFn: api.externalTests });
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Offline testlar"
        subtitle="Qog'ozda o'tkazilgan test natijalarini CSV (matrix.csv) orqali import qiling: tahlil va reyting chiqadi, o'quvchi va ota-ona ilovada ko'radi."
        actions={
          <button className="btn-primary" onClick={() => setImporting(true)}>
            <Upload size={16} /> Import qilish
          </button>
        }
      />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[["tests", "Testlar"], ["ranking", "Reyting"]] as const} />
      {tab === "ranking" ? (
        <Ranking />
      ) : (
        <>
          {q.isPending && <Spinner className="text-ink-4" />}
          {q.data?.tests.length === 0 && <Empty Icon={FileSpreadsheet} title="Hali import qilinmagan" hint="«Import qilish» tugmasini bosing: skaner eksporti yoki matrix.csv fayli bilan." />}
          <div className="space-y-2">
            {q.data?.tests.map((t) => (
              <button key={t.id} onClick={() => navigate(`/external/${t.id}`)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{t.title}</p>
                  <p className="truncate text-xs text-ink-3">
                    kod {t.code} · {t.questionCount} savol · {t.takenAt ? fmtDate(t.takenAt) : ""} · {t.matched}/{t.participants} o'quvchi topilgan
                  </p>
                </div>
                {t.avgPercent != null && <Badge tone={tone(t.avgPercent)}>o'rtacha {formatScore(t.avgPercent)}%</Badge>}
                <ChevronRight size={16} className="text-ink-4" />
              </button>
            ))}
          </div>
        </>
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={(id) => navigate(`/external/${id}`)} />}
    </>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<{ fileName: string; content: string } | null>(null);
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<ExternalPreview | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const check = useMutation({
    mutationFn: () => api.externalCsvPreview({ ...file!, title: title || null }),
    onSuccess: setPreview,
    onError: (e) => toast(errMsg(e), "error"),
  });
  const save = useMutation({
    mutationFn: () => api.externalCsvImport({ ...file!, title: title || null }),
    onSuccess: (r) => {
      toast(`Import qilindi: ${r.matched} ta o'quvchi topildi`);
      qc.invalidateQueries({ queryKey: ["external"] });
      onClose();
      onDone(r.id);
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const found = preview?.rows.filter((r) => r.match).length ?? 0;
  return (
    <Modal
      wide
      title="Test natijalarini import qilish"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Bekor qilish
          </button>
          {preview ? (
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {preview.test.alreadyImported ? "Yangilash" : "Import qilish"} ({preview.rows.length})
            </button>
          ) : (
            <button className="btn-primary" disabled={check.isPending || !file} onClick={() => check.mutate()}>
              {check.isPending ? <Spinner /> : null} Tekshirish
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setFile({ fileName: f.name, content: await f.text() }), setPreview(null);
          }}
        />
        <button className="btn-secondary w-full" onClick={() => input.current?.click()}>
          <FileUp size={16} /> {file ? file.fileName : "CSV faylni tanlang"}
        </button>
        <Field label="Test nomi" hint="Ikki xil fayl qabul qilinadi: skaner eksporti (Q 1 Marks… va «Sertifikat» bo'limlari bilan: Milliy sertifikat bali va darajasi hisoblanadi) yoki natijalar saytidagi «Matritsa (CSV)» (faqat to'g'ri/xato). Bo'sh qoldirsangiz, nom fayldan olinadi.">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: Mock #3, 15-noyabr" />
        </Field>
      </div>
      {preview && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            <p className="font-bold">{preview.test.title}</p>
            <p className="text-ink-3">
              {preview.test.questionCount} savol · {preview.test.participants} qatnashchi · <b className="text-emerald-700">{found} tasi topildi</b>
              {preview.rows.length - found > 0 && <b className="text-amber-700"> · {preview.rows.length - found} tasi topilmadi</b>}
            </p>
            {preview.test.sections.length > 0 && (
              <p className="mt-1 text-ink-3">
                Bo'limlar: {preview.test.sections.map((s) => `${s.title} (${s.toQ - s.fromQ + 1} katak)`).join(", ")}. Ball Milliy sertifikat shkalasida (Rasch, 75 dan)
                {preview.test.participants < RASCH_MIN_SAMPLE ? `: qatnashchi ${RASCH_MIN_SAMPLE} tadan kam, shuning uchun savollar qiyinligi hisobga olinmaydi` : ""}; esse bu faylda yo'q, daraja faqat test qismidan.
              </p>
            )}
            {preview.test.alreadyImported && <p className="mt-1 text-ink-3">Bu test oldin import qilingan: natijalar yangilanadi, qo'lda bog'laganlaringiz saqlanadi.</p>}
          </div>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
            {preview.rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">
                  {r.name}
                  {r.username && <span className="text-ink-4"> @{r.username}</span>}
                </span>
                {r.match ? <span className="truncate text-xs text-emerald-700">→ {r.match.name} ({HOW[r.match.how]})</span> : <span className="text-xs text-amber-700">topilmadi</span>}
                {r.scaledScore != null && (
                  <span className="w-20 shrink-0 text-right text-xs text-ink-3">
                    {formatScore(r.scaledScore)} ball{r.grade ? ` · ${r.grade}` : ""}
                  </span>
                )}
                <b className="w-12 text-right">{formatScore(r.percent)}%</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function Ranking() {
  const [days, setDays] = useState<"30" | "90" | "365" | "0">("90");
  const q = useQuery({ queryKey: ["external-ranking", days], queryFn: () => api.externalRanking(Number(days)) });
  return (
    <>
      <Chips className="mb-4" value={days} onChange={setDays} options={[["30", "30 kun"], ["90", "90 kun"], ["365", "1 yil"], ["0", "Hammasi"]] as const} />
      {q.isPending && <Spinner className="text-ink-4" />}
      {q.data?.length === 0 && <Empty title="Reyting uchun natija yo'q" />}
      {q.data && q.data.length > 0 && (
        <div className="card divide-y divide-line">
          {q.data.map((r, i) => (
            <Link key={r.studentId} to={`/students/${r.studentId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <span className={`w-7 text-center font-extrabold ${i < 3 ? "text-amber-700" : "text-ink-3"}`}>{i < 3 ? <Trophy size={16} className="mx-auto" /> : i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="text-xs text-ink-3">
                  {r.groupName ?? "online"} · {r.tests} ta test · eng yaxshisi {formatScore(r.best)}% · oxirgisi {formatScore(r.last)}%
                </p>
              </div>
              <Badge tone={tone(r.avgPercent)}>{formatScore(r.avgPercent)}%</Badge>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// ===================== Bitta test: tahlil =====================

export function ExternalTestPage() {
  const { id = "" } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["external", id], queryFn: () => api.externalTest(id) });
  const refresh = () => (qc.invalidateQueries({ queryKey: ["external"] }), qc.invalidateQueries({ queryKey: ["external", id] }));
  const notify = useMutation({
    mutationFn: () => api.externalNotify(id),
    onSuccess: (r) => (toast(r.students + r.parents ? `Xabar yuborildi: ${r.students} o'quvchi, ${r.parents} ota-ona` : "Hammaga allaqachon yuborilgan"), refresh()),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const remove = useMutation({ mutationFn: () => api.externalDelete(id), onSuccess: () => (refresh(), navigate("/external")) });
  const [essayOpen, setEssayOpen] = useState(false);
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  const t = q.data;
  const waiting = t.rows.filter((r) => r.student && !r.notifiedAt).length;
  const essays = t.rows.filter((r) => r.essayScore != null).length;
  // Milliy sertifikat bahosi bor (skaner eksporti): daraja taqsimoti foizdan muhimroq
  const scaled = t.rows.map((r) => r.scaledScore).filter((x): x is number => x != null);
  const milliy = scaled.length > 0;
  const levels = [...MILLIY_LEVELS.map((l) => l.code), null].map((code) => ({ label: code ?? "Sertifikatsiz", value: t.rows.filter((r) => r.grade === code).length }));
  return (
    <div className="space-y-4">
      <Link to="/external" className="tap inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-ink">
        ← Offline testlar
      </Link>
      <PageHeader
        title={t.title}
        subtitle={`CSV fayldan · ${t.questionCount} savol${t.subject ? ` · ${t.subject}` : ""}${t.takenAt ? ` · ${fmtDate(t.takenAt)}` : ""}`}
        actions={
          <>
            {t.rasch && (
              <button className="btn-secondary" onClick={() => setEssayOpen(true)}>
                <PenLine size={15} /> Esse ballari{essays ? ` (${essays}/${t.participants})` : ""}
              </button>
            )}
            <button className="btn-primary" disabled={!waiting || notify.isPending} onClick={() => notify.mutate()} title="Natija matnda bo'lmaydi: ilovani ochishga chaqiradi">
              <Send size={15} /> Xabar yuborish{waiting ? ` (${waiting})` : ""}
            </button>
            <ConfirmButton label="O'chirilsinmi?" onConfirm={() => remove.mutate()}>
              <Trash2 size={14} />
            </ConfirmButton>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Qatnashchi" value={t.participants} hint={`${t.matched} tasi platformada topilgan`} />
        <Tile label="O'rtacha" value={t.avgPercent != null ? `${formatScore(t.avgPercent)}%` : "—"} hint={t.stats.median != null ? `mediana ${formatScore(t.stats.median)}%` : undefined} />
        {milliy ? (
          <Tile label="O'rtacha ball" value={formatScore(Math.round((scaled.reduce((s, x) => s + x, 0) / scaled.length) * 10) / 10)} hint={`75 dan · sertifikat olgan: ${t.rows.filter((r) => r.grade).length} ta`} />
        ) : (
          <Tile label="Eng yuqori" value={t.rows[0] ? `${formatScore(t.rows[0].percent)}%` : "—"} hint={t.rows[0]?.name} />
        )}
        <Tile label="Xabar" value={t.notifiedAt ? fmtDate(t.notifiedAt) : "yuborilmagan"} hint={waiting ? `${waiting} ta o'quvchi kutmoqda` : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          {milliy ? (
            <>
              <h2 className="mb-1 font-extrabold">Darajalar</h2>
              <p className="mb-3 text-xs text-ink-3">Milliy sertifikat shkalasi (Rasch), faqat test qismi: esse bu faylda yo'q</p>
              <Bars items={levels} />
            </>
          ) : (
            <>
              <h2 className="mb-3 font-extrabold">Foiz taqsimoti</h2>
              <Bars items={t.stats.buckets.map((b) => ({ label: b.label, value: b.count }))} />
            </>
          )}
        </section>
        {t.stats.sections.length > 0 ? (
          <section className="card p-4 sm:p-5">
            <h2 className="mb-3 font-extrabold">Bo'limlar bo'yicha o'rtacha</h2>
            <ul className="space-y-2 text-sm">
              {t.stats.sections.map((s, i) => (
                <li key={i}>
                  <div className="mb-1 flex justify-between gap-3">
                    <span className="text-ink-2">
                      {s.title ?? `${i + 1}-bo'lim`}
                      {s.title !== questionsLabel(s) && <span className="text-ink-4"> ({questionsLabel(s)})</span>}
                    </span>
                    <b>{formatScore(s.avgPercent)}%</b>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3">
                    <div className={`h-full rounded-full ${s.avgPercent < 50 ? "bg-amber-400" : "bg-brand"}`} style={{ width: `${s.avgPercent}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <Hardest t={t} />
        )}
      </div>
      {t.stats.sections.length > 0 && <Hardest t={t} />}
      <section className="card p-4 sm:p-5">
        <h2 className="mb-1 font-extrabold">Har savol: to'g'ri javob ulushi</h2>
        <p className="mb-3 text-xs text-ink-3">Qizil: yarmidan kami to'g'ri yechgan. Shu savollar mavzusini darsda qayta ko'ring</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5">
          {t.stats.questions.map((x) => (
            <div key={x.q} title={`${x.q}-savol: ${x.correctPct}% to'g'ri, ${x.blankPct}% bo'sh`} className={`rounded-md px-1 py-1.5 text-center text-xs ${x.correctPct < 50 ? "bg-red-100 text-red-700" : x.correctPct < 75 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
              <p className="text-[10px] text-ink-4">{x.q}</p>
              <b>{Math.round(x.correctPct)}%</b>
            </div>
          ))}
        </div>
      </section>
      <RaschCard t={t} />
      <Results t={t} onChanged={refresh} />
      {essayOpen && <EssayModal t={t} onClose={() => setEssayOpen(false)} onDone={refresh} />}
    </div>
  );
}

function Hardest({ t }: { t: ExternalTestDetail }) {
  const hard = [...t.stats.questions].sort((a, b) => a.correctPct - b.correctPct).slice(0, 8);
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 font-extrabold">Eng ko'p xato qilingan savollar</h2>
      <Bars items={hard.map((x) => ({ label: `${x.q}-savol`, value: x.correctPct, suffix: "% to'g'ri" }))} max={100} warn />
    </section>
  );
}

function Results({ t, onChanged }: { t: ExternalTestDetail; onChanged: () => void }) {
  const [linking, setLinking] = useState<ExternalTestDetail["rows"][number] | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [card, setCard] = useState<ExternalTestDetail["rows"][number] | null>(null);
  const rows = showUnmatched ? t.rows.filter((r) => !r.student) : t.rows;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
        <h2 className="flex-1 font-extrabold">Natijalar</h2>
        {t.participants > t.matched && (
          <button className={`btn-sm btn ${showUnmatched ? "border border-amber-300 bg-amber-100 text-amber-800" : "btn-secondary"}`} onClick={() => setShowUnmatched(!showUnmatched)}>
            Topilmaganlar ({t.participants - t.matched})
          </button>
        )}
      </div>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 sm:flex-nowrap sm:gap-3 sm:px-5">
            <span className="w-6 shrink-0 text-center font-extrabold text-ink-3 sm:w-7">{r.rank}</span>
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold sm:truncate">
                {r.student ? <Link to={`/students/${r.student.id}`} className="hover:underline">{r.student.name}</Link> : r.name}
                {r.student && r.student.name !== r.name && <span className="ml-1.5 text-xs font-normal text-ink-4">testda: {r.name}</span>}
              </p>
              <p className="text-xs text-ink-3 sm:truncate">
                {r.correct} to'g'ri · {r.wrong} xato · {r.blank} bo'sh
                {r.testScore != null ? ` · test ${formatScore(r.testScore)}${r.essayScore != null ? ` · esse ${formatScore(r.essayScore)}/24` : ""}` : ""}
                {r.scaledScore != null ? ` · ${formatScore(r.scaledScore)} ball` : ""}
                {r.grade ? ` · ${r.grade}` : ""}
                {!r.student && <span className="text-amber-700"> · platformada topilmadi</span>}
              </p>
            </div>
            {/* Telefonda amallar alohida qatorda, yozuvi bilan: ism uchun joy qoladi */}
            <div className="order-last flex w-full gap-1 pl-7 sm:order-none sm:w-auto sm:pl-0">
              {t.rasch && (
                <button className="btn-ghost btn-sm gap-1.5 px-2 sm:h-9 sm:w-9 sm:p-0" onClick={() => setCard(r)} title="Natija kartasi" aria-label="Natija kartasi">
                  <FileText size={14} />
                  <span className="sm:hidden">Natija kartasi</span>
                </button>
              )}
              <button className="btn-ghost btn-sm gap-1.5 px-2 sm:h-9 sm:w-9 sm:p-0" onClick={() => setLinking(r)} title="O'quvchiga bog'lash" aria-label="O'quvchiga bog'lash">
                <Link2 size={14} />
                <span className="sm:hidden">Bog'lash</span>
              </button>
            </div>
            <Badge tone={tone(r.percent)}>{formatScore(r.percent)}%</Badge>
          </li>
        ))}
      </ul>
      {card && <ResultCardModal t={t} row={card} onClose={() => setCard(null)} />}
      {linking && <LinkModal testId={t.id} row={linking} onClose={() => setLinking(null)} onDone={onChanged} />}
    </section>
  );
}

function LinkModal({ testId, row, onClose, onDone }: { testId: string; row: ExternalTestDetail["rows"][number]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState(row.name);
  const roster = useQuery({ queryKey: ["roster", "", ""], queryFn: () => api.roster("", "") });
  const save = useMutation({
    mutationFn: (studentId: string | null) => api.externalLink(testId, row.id, studentId),
    onSuccess: () => (toast("Bog'landi"), onDone(), onClose()),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = (roster.data ?? []).filter((s) => words.every((w) => `${s.name} ${s.username ?? ""}`.toLowerCase().includes(w))).slice(0, 30);
  return (
    <Modal title={`«${row.name}» kim?`} onClose={onClose}>
      <input className="input mb-3" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki @username" />
      {roster.isPending && <Spinner className="text-ink-4" />}
      <ul className="divide-y divide-line">
        {list.map((s) => (
          <li key={s.studentId}>
            <button className="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-surface-2" disabled={save.isPending} onClick={() => save.mutate(s.studentId)}>
              <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
              <span className="text-xs text-ink-3">{s.group?.name ?? "online"}</span>
            </button>
          </li>
        ))}
      </ul>
      {row.student && (
        <button className="btn-secondary btn-sm mt-3" onClick={() => save.mutate(null)}>
          Bog'lanishni olib tashlash
        </button>
      )}
    </Modal>
  );
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  // So'z bilan yozilgan qiymat («yuborilmagan») telefonda ikki ustunli kartaga sig'sin, bo'linib ketmasin
  const wordy = typeof value === "string" && /[a-z]{6,}/i.test(value);
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-1 break-words font-extrabold leading-tight tracking-tight sm:truncate ${wordy ? "text-base sm:text-2xl" : "text-xl sm:text-2xl"}`}>{value}</p>
      {hint && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3 sm:truncate">{hint}</p>}
    </div>
  );
}

function Bars({ items, max, warn }: { items: { label: string; value: number; suffix?: string }[]; max?: number; warn?: boolean }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-1.5">
      {items.map((b) => (
        <li key={b.label} className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-ink-2">{b.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-surface-3">
            <div className={`h-full rounded ${warn && b.value < 50 ? "bg-red-400/70" : "bg-brand/80"}`} style={{ width: `${(b.value / top) * 100}%` }} />
          </div>
          <b className="w-20 text-right text-xs">
            {formatScore(b.value)}
            {b.suffix ?? ""}
          </b>
        </li>
      ))}
    </ul>
  );
}
