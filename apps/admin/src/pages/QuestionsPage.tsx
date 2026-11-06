import { questionInput, type AdminQuestion, type QuestionInput } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Plus, Search, Square, SquareCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, ConfirmButton, Empty, Field, Modal, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { plainText } from "../lib/format";
import { useToast } from "../lib/toast";

export const TYPE_LABELS: Record<string, string> = { SINGLE: "Bitta javob", MULTIPLE: "Bir nechta javob", TEXT: "Yozma javob", ESSAY: "Esse", MATCHING: "Moslashtirish" };

/** Import qilingan savol kaliti hali ustoz tomonidan ko'rilmagan */
export function KeyBadge({ status }: { status: "proposed" | "uncertain" | null }) {
  if (!status) return null;
  return status === "uncertain" ? <Badge tone="red">Kalit shubhali</Badge> : <Badge tone="amber">Kalit tekshirilsin</Badge>;
}

export function usePassages() {
  return useQuery({ queryKey: ["passages"], queryFn: api.passages });
}

export function useTopics() {
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });
  return useMemo(
    () => (courses.data ?? []).flatMap((c) => c.topics.map((t) => ({ id: t.id, title: t.title, course: c.title }))),
    [courses.data],
  );
}

export function QuestionsPage() {
  const topics = useTopics();
  const [topicId, setTopicId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminQuestion | "new" | null>(null);
  const qs = useQuery({
    queryKey: ["questions", topicId, search, page],
    queryFn: () => api.questions({ topicId: topicId || undefined, search: search || undefined, page }),
    placeholderData: (p) => p,
  });
  const pages = Math.max(1, Math.ceil((qs.data?.total ?? 0) / 30));

  return (
    <>
      <PageHeader
        title="Savollar banki"
        subtitle="Savollar bir marta kiritiladi va istalgan testda qayta ishlatiladi."
        actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus size={16} /> Savol qo'shish</button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-full sm:w-auto sm:min-w-[220px]" value={topicId} onChange={(e) => { setTopicId(e.target.value); setPage(1); }}>
          <option value="">Barcha mavzular</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          <option value="none">Mavzusiz</option>
        </select>
        <div className="relative w-full min-w-0 flex-1 sm:w-auto sm:min-w-[240px]">
          <Search size={16} className="absolute left-3 top-3.5 text-slate-400 sm:top-3" />
          <input className="input pl-9" placeholder="Savol matni bo'yicha qidirish" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {qs.isPending && <Spinner className="text-slate-400" />}
      {qs.data?.items.length === 0 && <Empty title="Savol topilmadi" hint="Yangi savol qo'shing yoki filtrni o'zgartiring." />}
      <div className="space-y-2">
        {qs.data?.items.map((q) => (
          <button key={q.id} onClick={() => setEditing(q)} className="card flex w-full items-start gap-3 p-4 text-left transition hover:border-brand">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold">{plainText(q.text)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="blue">{TYPE_LABELS[q.type]}</Badge>
                {q.topicTitle && <Badge>{q.topicTitle}</Badge>}
                {q.passageTitle && <Badge tone="brand">{q.passageTitle}</Badge>}
                <KeyBadge status={q.keyStatus} />
                <Badge>{q.type === "TEXT" ? `Javob: ${(q.correctText ?? "").split("|").join(" / ")}` : `${q.options.length} variant`}</Badge>
                {q.usedInTests > 0 && <Badge tone="green">{q.usedInTests} ta testda</Badge>}
              </div>
            </div>
          </button>
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Oldingi</button>
          <span className="font-semibold">{page} / {pages}</span>
          <button className="btn-secondary btn-sm" disabled={page === pages} onClick={() => setPage(page + 1)}>Keyingi</button>
        </div>
      )}

      {editing && <QuestionModal question={editing === "new" ? null : editing} defaultTopicId={topicId && topicId !== "none" ? topicId : null} onClose={() => setEditing(null)} />}
    </>
  );
}

type Opt = { id?: string; text: string; isCorrect: boolean };

export function QuestionModal({ question, defaultTopicId, onClose, onSaved }: { question: AdminQuestion | null; defaultTopicId?: string | null; onClose: () => void; onSaved?: (q: AdminQuestion) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const topics = useTopics();
  const [type, setType] = useState<"SINGLE" | "MULTIPLE" | "TEXT" | "ESSAY">((question?.type as "SINGLE") ?? "SINGLE");
  const [passageId, setPassageId] = useState(question?.passageId ?? "");
  const [newPassage, setNewPassage] = useState(false);
  const passages = usePassages();
  const [topicId, setTopicId] = useState(question?.topicId ?? defaultTopicId ?? "");
  const [text, setText] = useState(question?.text ?? "");
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [correctText, setCorrectText] = useState(question?.correctText ?? "");
  const [options, setOptions] = useState<Opt[]>(
    question?.options.length ? question.options : [{ text: "", isCorrect: true }, { text: "", isCorrect: false }, { text: "", isCorrect: false }, { text: "", isCorrect: false }],
  );
  const [err, setErr] = useState<string | null>(null);

  const setOpt = (i: number, patch: Partial<Opt>) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const markCorrect = (i: number) =>
    setOptions((o) => o.map((x, j) => (type === "SINGLE" ? { ...x, isCorrect: j === i } : j === i ? { ...x, isCorrect: !x.isCorrect } : x)));

  const payload = (): QuestionInput => ({
    topicId: topicId || null,
    passageId: passageId || null,
    type,
    text,
    explanation: explanation.trim() || null,
    correctText: type === "TEXT" ? correctText.trim() : null,
    difficulty: question?.difficulty ?? 2,
    options: type === "TEXT" || type === "ESSAY" ? [] : options.filter((o) => o.text.trim()),
  });

  const save = useMutation({
    mutationFn: () => {
      const d = payload();
      const check = questionInput.safeParse(d);
      if (!check.success) throw new Error(check.error.issues[0].message);
      return question ? api.updateQuestion(question.id, d) : api.createQuestion(d);
    },
    onSuccess: (q) => {
      toast("Savol saqlandi");
      qc.invalidateQueries({ queryKey: ["questions"] });
      onSaved?.(q);
      onClose();
    },
    onError: (e) => setErr(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: () => api.deleteQuestion(question!.id),
    onSuccess: () => {
      toast("Savol o'chirildi");
      qc.invalidateQueries({ queryKey: ["questions"] });
      onClose();
    },
    onError: (e) => setErr(errMsg(e)),
  });

  return (
    <Modal
      title={question ? "Savolni tahrirlash" : "Yangi savol"}
      onClose={onClose}
      footer={
        <>
          {question && <span className="mr-auto"><ConfirmButton onConfirm={() => del.mutate()}><Trash2 size={14} /> O'chirish</ConfirmButton></span>}
          <button className="btn-secondary" onClick={onClose}>Bekor qilish</button>
          <button className="btn-primary" onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending}>{save.isPending && <Spinner />} Saqlash</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Turi">
            <select
              className="input"
              value={type}
              onChange={(e) => {
                const t = e.target.value as typeof type;
                setType(t);
                // Bitta javobga o'tilsa, faqat birinchi belgilangan to'g'ri javob qoladi
                if (t === "SINGLE") {
                  const first = options.findIndex((o) => o.isCorrect);
                  setOptions((o) => o.map((x, j) => ({ ...x, isCorrect: j === Math.max(0, first) })));
                }
              }}
            >
              <option value="SINGLE">{TYPE_LABELS.SINGLE}</option>
              <option value="MULTIPLE">{TYPE_LABELS.MULTIPLE}</option>
              <option value="TEXT">{TYPE_LABELS.TEXT}</option>
              <option value="ESSAY">{TYPE_LABELS.ESSAY}</option>
            </select>
          </Field>
          <Field label="Mavzu">
            <select className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">Mavzusiz</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
        </div>

        {question?.keyStatus && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Bu savol PDF'dan import qilingan, javob kaliti taklif sifatida qo'yilgan
            {question.keyStatus === "uncertain" ? " va shubhali" : ""}. Tekshirib, «Saqlash»ni bossangiz, kalit tasdiqlangan hisoblanadi.
          </p>
        )}

        <Field label="Umumiy matn (ixtiyoriy)" hint="Bir nechta savol tayanadigan o'qish matni, she'r yoki g'azal. Test paytida savol ustida ko'rinadi.">
          <div className="flex gap-2">
            <select className="input min-w-0" value={passageId} onChange={(e) => setPassageId(e.target.value)}>
              <option value="">Matnsiz</option>
              {passages.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title ?? p.body.slice(0, 50)} ({p.questionCount})
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary shrink-0" onClick={() => setNewPassage(true)}>
              <Plus size={16} /> Yangi
            </button>
          </div>
        </Field>

        <Field label={type === "ESSAY" ? "Esse topshirig'i" : "Savol matni"} hint="Formatlash: **qalin**, *kursiv*; yangi qator bilan ro'yxat va she'r qatorlari">
          <textarea className="textarea min-h-[90px]" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>

        {type === "ESSAY" ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Esse avtomatik baholanmaydi: o'quvchi yozgach, «Kontent → Esselar» bo'limida ustoz ball qo'yadi. Ballni testda belgilaysiz (Milliy sertifikatda 24).
          </p>
        ) : type === "TEXT" ? (
          <Field label="To'g'ri javob" hint="Bir nechta to'g'ri variant bo'lsa, | bilan ajrating: «2|ikki». Katta-kichik harf va tutuq belgisi (ʻ ' `) farqi hisobga olinmaydi. Faqat tinish belgilaridan iborat javobda (masalan, ' &quot;&quot;:&quot;,&quot;. ') bo'sh joy va qo'shtirnoq turi farqlanmaydi, nuqta esa hisobga olinadi.">
            <input className="input" value={correctText} onChange={(e) => setCorrectText(e.target.value)} />
          </Field>
        ) : (
          <div>
            <label className="label">Variantlar · to'g'risini belgilang</label>
            <div className="space-y-2">
              {options.map((o, i) => {
                const Icon = type === "SINGLE" ? (o.isCorrect ? CheckCircle2 : Circle) : o.isCorrect ? SquareCheck : Square;
                return (
                  <div key={o.id ?? `new-${i}`} className="flex items-center gap-2">
                    <button type="button" onClick={() => markCorrect(i)} className={o.isCorrect ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"} aria-label="To'g'ri javob">
                      <Icon size={22} />
                    </button>
                    <span className="w-5 text-sm font-extrabold text-slate-400">{String.fromCharCode(65 + i)}</span>
                    <input className={`input ${o.isCorrect ? "border-emerald-400" : ""}`} value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} />
                    <button type="button" className="btn-ghost h-9 w-9 p-0 text-slate-400" disabled={options.length <= 2} onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} aria-label="Variantni o'chirish">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
            {options.length < 8 && (
              <button type="button" className="btn-ghost btn-sm mt-2 text-brand" onClick={() => setOptions((o) => [...o, { text: "", isCorrect: false }])}>
                <Plus size={14} /> Variant qo'shish
              </button>
            )}
          </div>
        )}

        <Field label="Izoh (natijada ko'rsatiladi)">
          <textarea className="textarea min-h-[60px]" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Nega bu javob to'g'ri?" />
        </Field>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}
      </div>
      {newPassage && <PassageModal onClose={() => setNewPassage(false)} onSaved={(p) => setPassageId(p.id)} />}
    </Modal>
  );
}

export function PassageModal({ passage, onClose, onSaved }: { passage?: { id: string; title: string | null; body: string }; onClose: () => void; onSaved?: (p: { id: string }) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(passage?.title ?? "");
  const [body, setBody] = useState(passage?.body ?? "");
  const save = useMutation({
    mutationFn: async () => {
      if (passage) {
        await api.updatePassage(passage.id, { title: title || null, body });
        return { id: passage.id };
      }
      return api.createPassage({ title: title || null, body });
    },
    onSuccess: (p) => {
      toast("Matn saqlandi");
      qc.invalidateQueries({ queryKey: ["passages"] });
      qc.invalidateQueries({ queryKey: ["questions"] });
      onSaved?.(p);
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title={passage ? "Matnni tahrirlash" : "Yangi matn"}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Bekor qilish</button>
          <button className="btn-primary" disabled={!body.trim() || save.isPending} onClick={() => save.mutate()}>Saqlash</button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Sarlavha">
          <input className="input" placeholder="Masalan: Matn: Merkuriy (18–22)" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Matn" hint="Formatlash: # sarlavha, **qalin**, *kursiv*. Har bir she'r qatorini yangi qatorga yozing.">
          <textarea className="textarea min-h-[300px] font-mono text-[13px]" value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
