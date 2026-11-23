import { countMarks, essayTo75, type AdminEssay, type TextMark, formatScore } from "@onatili/shared";
import { MarkCounts, TextAnnotator } from "../components/Annotate";
import { RubricForm, rubricComplete, rubricTotal, type RubricValue } from "../components/RubricForm";
import { VoicePlayer, VoiceRecorder } from "../components/VoiceRecorder";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, PenLine } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Empty, Field, Modal, NoMatch, PageHeader, SearchBox, Spinner, Segmented, Chips } from "../components/ui";
import { matches } from "../lib/search";
import { api, errMsg } from "../lib/api";
import { fmtShortDateTime } from "../lib/format";
import { useToast } from "../lib/toast";
import { EssayLog, EssayStats } from "./EssayInsights";
import { HwEssays } from "./HwEssays";

const SUBTITLES = {
  hw: "O'quvchi varoqqa yozib rasmini yuborgan va ustoz tekshiruvi uchun to'lagan esselar. Baho bot orqali o'quvchiga boradi.",
  mock: "Mock testlardagi esselar. Ball qo'yilgach, o'quvchiga umumiy natija va daraja bot orqali yuboriladi.",
  log: "Botda yuborilgan barcha esselar: kim yubordi, AI va ustoz qancha ball qo'ydi. Bosing: har band bo'yicha baho, xatolar va tavsiyalar.",
  stats: "Esselar soni, o'rtacha ball va o'quvchilar qaysi bandlarda zaif.",
} as const;

type Source = keyof typeof SUBTITLES;
const SOURCES = Object.keys(SUBTITLES) as Source[];

export function EssaysPage() {
  const [params, setParams] = useSearchParams();
  // Menyudagi son ikkala navbatni qo'shib sanaydi: ochilganda kutayotgan esse bor bo'limga o'tiladi
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 30_000 });
  const by = dash.data?.pendingEssaysBy;
  const fromUrl = params.get("tab") as Source | null;
  const source: Source = fromUrl && SOURCES.includes(fromUrl) ? fromUrl : by && !by.hw && by.mock ? "mock" : "hw";
  const setSource = (s: Source) => setParams({ tab: s }, { replace: true });
  const count = (n?: number) => (n ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[11px] text-white">{n}</span> : null);
  return (
    <>
      <PageHeader title="Esselar" subtitle={SUBTITLES[source]} />
      <Segmented
        className="mb-4"
        value={source}
        onChange={setSource}
        options={
          [
            ["hw", <>Qo'lyozma{count(by?.hw)}</>],
            ["mock", <>Mock{count(by?.mock)}</>],
            ["log", "Barcha esselar"],
            ["stats", "Statistika"],
          ] as const
        }
      />
      {source === "hw" ? <HwEssays /> : source === "mock" ? <MockEssays /> : source === "log" ? <EssayLog /> : <EssayStats />}
    </>
  );
}

function MockEssays() {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [open, setOpen] = useState<AdminEssay | null>(null);
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["essays", tab], queryFn: () => api.essays(tab), refetchInterval: tab === "pending" ? 30_000 : false });
  const shown = (list.data ?? []).filter((e) => matches(q, e.student.name, e.student.username, e.testTitle));

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Chips
          value={tab}
          onChange={setTab}
          options={
            [
              ["pending", "Tekshirilmagan"],
              ["reviewed", "Tekshirilgan"],
            ] as const
          }
        />
        <SearchBox value={q} onChange={setQ} placeholder="Ism, @username yoki test" />
      </div>
      {list.isPending && <Spinner className="text-ink-4" />}
      {list.data?.length === 0 && <Empty Icon={PenLine} title={tab === "pending" ? "Tekshiriladigan esse yo'q" : "Hali esse tekshirilmagan"} />}
      {!!list.data?.length && !shown.length && <NoMatch q={q} onClear={() => setQ("")} />}
      <div className="space-y-2">
        {shown.map((e) => (
          <button
            key={`${e.attemptId}-${e.questionId}`}
            onClick={() => setOpen(e)}
            className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{e.student.name}</p>
              <p className="truncate text-xs text-ink-3">
                {e.testTitle} · {e.words} ta so'z · {fmtShortDateTime(e.submittedAt)}
              </p>
            </div>
            {e.points !== null ? (
              <Badge tone="green">
                {formatScore(e.points)}/{formatScore(e.maxPoints)}
              </Badge>
            ) : (
              <Badge tone="amber">{formatScore(e.maxPoints)} ball</Badge>
            )}
            <ChevronRight size={18} className="text-ink-4" />
          </button>
        ))}
      </div>
      {open && <ReviewModal essay={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReviewModal({ essay, onClose }: { essay: AdminEssay; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [points, setPoints] = useState(essay.points !== null ? formatScore(essay.points) : "");
  const [comment, setComment] = useState(essay.reviewComment ?? "");
  // Milliy sertifikat: rasmiy mezon (12 band) bilan baholanadi, ball shundan chiqadi
  const [rubric, setRubric] = useState<RubricValue>(() => ({
    special: (essay.special as RubricValue["special"]) ?? null,
    scores: Object.fromEntries((essay.rubric ?? []).map((c) => [c.key, c.score])),
  }));
  const [voice, setVoice] = useState<Blob | null>(null);
  const [marks, setMarks] = useState<TextMark[]>(essay.textMarks ?? []);
  const value = Number(points.replace(",", "."));
  const valid = essay.milliy ? rubricComplete(rubric) : points.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= essay.maxPoints;

  const save = useMutation({
    mutationFn: async () => {
      // Matndagi belgilar baho bilan birga saqlanadi
      if (essay.milliy) await api.saveMockMarks(essay.attemptId, essay.questionId, marks);
      return api.reviewEssay(
        essay.attemptId,
        essay.questionId,
        essay.milliy
          ? {
              special: rubric.special,
              criteria: Object.entries(rubric.scores).map(([key, score]) => ({ key, score: score ?? 0 })),
              comment: comment.trim() || null,
            }
          : { points: value, comment: comment.trim() || null },
      );
    },
    onSuccess: async () => {
      if (voice)
        await api.uploadMockVoice(essay.attemptId, essay.questionId, voice).catch((e) => toast(`Baho saqlandi, lekin ovoz yuborilmadi: ${errMsg(e)}`, "error"));
      toast(`Saqlandi${voice ? " · ovozli izoh bilan" : ""}. O'quvchiga yuborildi`);
      qc.invalidateQueries({ queryKey: ["essays"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal
      title={essay.student.name}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Yopish
          </button>
          <button className="btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Bahoni saqlash
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <details className="rounded-xl bg-surface-2 p-3 text-sm">
          <summary className="cursor-pointer font-bold text-ink-2">Topshiriq ({essay.testTitle})</summary>
          <p className="mt-2 whitespace-pre-line text-ink-2">{essay.prompt.replace(/\*\*|#\s?/g, "")}</p>
        </details>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Esse</span>
            <span className="text-xs font-semibold text-ink-3">{essay.words} ta so'z</span>
          </div>
          {essay.milliy ? (
            <div className="max-h-[55vh] overflow-y-auto">
              <TextAnnotator text={essay.text} value={marks} onChange={setMarks} />
            </div>
          ) : (
            <div className="max-h-[45vh] overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-surface p-4 text-[15px] leading-relaxed">
              {essay.text}
            </div>
          )}
          {essay.milliy && (
            <div className="mt-2">
              <MarkCounts counts={countMarks({ pages: [], text: marks })} />
            </div>
          )}
        </div>

        {essay.milliy ? (
          <>
            <RubricForm value={rubric} onChange={setRubric} />
            <p className="text-sm font-bold">
              Jami: {formatScore(rubricTotal(rubric))} / 24 → 75 ballik shkalada {essayTo75(rubricTotal(rubric))}
            </p>
            <Field label="Taqriz (o'quvchiga yuboriladi)">
              <textarea
                className="textarea min-h-[110px]"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ekspert xulosasi: kuchli tomonlari, xatolari, tavsiyalar…"
              />
            </Field>
            {essay.voice && !voice && (
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="mb-1 text-xs font-bold text-ink-3">Yuborilgan ovozli izoh</p>
                <VoicePlayer voice={essay.voice} />
              </div>
            )}
            <VoiceRecorder value={voice} onChange={setVoice} />
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <Field label={`Ball (0 – ${formatScore(essay.maxPoints)})`}>
              <input
                className="input text-lg font-bold"
                inputMode="decimal"
                value={points}
                onChange={(e) => setPoints(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="btn-sm btn border border-line text-ink-2"
                    onClick={() => setPoints(formatScore(essay.maxPoints * f))}
                  >
                    {formatScore(essay.maxPoints * f)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Izoh (o'quvchiga yuboriladi)">
              <textarea
                className="textarea min-h-[110px]"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Kuchli tomonlari, xatolari, tavsiyalar…"
              />
            </Field>
          </div>
        )}
        {!essay.milliy && points.trim() !== "" && !valid && (
          <p className="text-sm font-semibold text-red-600">Ball 0 dan {formatScore(essay.maxPoints)} gacha bo'lishi kerak</p>
        )}
      </div>
    </Modal>
  );
}
