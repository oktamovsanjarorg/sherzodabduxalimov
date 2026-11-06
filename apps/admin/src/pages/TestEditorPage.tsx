import type { AdminQuestion, AdminTestDetail, TestInput } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, ConfirmButton, Field, Modal, PageHeader, Spinner, Toggle } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { plainText } from "../lib/format";
import { useToast } from "../lib/toast";
import { KeyBadge, QuestionModal, TYPE_LABELS, useTopics } from "./QuestionsPage";

export function TestEditorPage() {
  const { id = "" } = useParams();
  const isNew = id === "new";
  const test = useQuery({ queryKey: ["test", id], queryFn: () => api.test(id), enabled: !isNew });
  if (!isNew && test.isPending) return <Spinner className="text-slate-400" />;
  if (!isNew && test.isError) return <p className="text-sm text-red-600">{errMsg(test.error)}</p>;
  return <Editor key={id} initial={isNew ? null : test.data!} />;
}

type Item = { question: AdminQuestion; points: number };

function Editor({ initial }: { initial: AdminTestDetail | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const topics = useTopics();

  const [type, setType] = useState<"TOPIC" | "MOCK">(initial?.type ?? (params.get("type") === "MOCK" ? "MOCK" : "TOPIC"));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [topicId, setTopicId] = useState(initial?.topicId ?? params.get("topicId") ?? "");
  const [minutes, setMinutes] = useState(initial?.timeLimitSec ? String(Math.round(initial.timeLimitSec / 60)) : type === "MOCK" ? "60" : "");
  const [shuffle, setShuffle] = useState(initial?.shuffle ?? true);
  const [milliy, setMilliy] = useState(initial?.gradingScale === "MILLIY_SERTIFIKAT");
  const [isFree, setIsFree] = useState(initial?.isFree ?? false);
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? false);
  const [items, setItems] = useState<Item[]>(initial?.questions.map((q) => ({ question: q.question, points: q.points })) ?? []);
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const payload = (): TestInput => ({
    type,
    title,
    description: description.trim() || null,
    topicId: topicId || null,
    timeLimitSec: minutes ? Number(minutes) * 60 : null,
    shuffle,
    gradingScale: milliy ? "MILLIY_SERTIFIKAT" : "NONE",
    isFree,
    isPublished,
    questions: items.map((i) => ({ questionId: i.question.id, points: i.points })),
  });

  const save = useMutation({
    mutationFn: () => (initial ? api.updateTest(initial.id, payload()) : api.createTest(payload())),
    onSuccess: (t) => {
      toast("Test saqlandi");
      qc.invalidateQueries({ queryKey: ["tests"] });
      qc.invalidateQueries({ queryKey: ["courses"] });
      qc.setQueryData(["test", t.id], t);
      if (!initial) navigate(`/tests/${t.id}`, { replace: true });
    },
    onError: (e) => setErr(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: () => api.deleteTest(initial!.id),
    onSuccess: () => {
      toast("Test o'chirildi. Korzinkadan 30 kun ichida tiklash mumkin");
      qc.invalidateQueries({ queryKey: ["tests"] });
      navigate("/tests");
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const add = (qs: AdminQuestion[]) =>
    setItems((cur) => [...cur, ...qs.filter((q) => !cur.some((c) => c.question.id === q.id)).map((q) => ({ question: q, points: 1 }))]);
  const moveItem = (i: number, d: -1 | 1) =>
    setItems((cur) => {
      const n = [...cur];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const total = items.reduce((s, i) => s + i.points, 0);

  return (
    <>
      <Link to="/tests" className="tap mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Testlar
      </Link>
      <PageHeader
        title={initial ? initial.title : type === "MOCK" ? "Yangi mock test" : "Yangi mavzu testi"}
        subtitle={initial ? `${initial.attemptCount} marta topshirilgan` : undefined}
        actions={
          <>
            {initial && <ConfirmButton onConfirm={() => del.mutate()} className="btn-danger" label="Test o'chirilsinmi?"><Trash2 size={16} /> O'chirish</ConfirmButton>}
            <button className="btn-primary" onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending}>{save.isPending && <Spinner />} Saqlash</button>
          </>
        }
      />
      {items.some((i) => i.question.keyStatus) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {items.filter((i) => i.question.keyStatus).length} ta savolning javob kaliti hali tasdiqlanmagan
          ({items.filter((i) => i.question.keyStatus === "uncertain").length} tasi shubhali). Nashr qilishdan oldin har birini ochib tekshiring.
        </p>
      )}
      {err && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}

      <div className="grid grid-cols-1 min-w-0 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="card h-fit space-y-4 p-5">
          <Field label="Turi">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as "TOPIC" | "MOCK")}>
              <option value="TOPIC">Mavzu testi</option>
              <option value="MOCK">Mock test (milliy sertifikat)</option>
            </select>
          </Field>
          <Field label="Nomi">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "MOCK" ? "Mock: 1-variant" : "Fonetika: 1-test"} />
          </Field>
          <Field label={type === "TOPIC" ? "Mavzu" : "Mavzu (ixtiyoriy)"}>
            <select className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">—</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
          <Field label="Vaqt (daqiqa)" hint="Bo'sh: vaqt cheklanmaydi">
            <input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Tavsif (ixtiyoriy)">
            <textarea className="textarea min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {type === "MOCK" && (
            <Toggle checked={milliy} onChange={setMilliy} label="Milliy sertifikat shkalasi" hint="Rasmiy tartib: test qismi Rasch modeli bilan (savollarga qo'lda ball qo'yilmaydi), esse 24 ballik mezon bilan baholanib 75 ballik shkalaga o'tkaziladi; umumiy ball — o'rtachasi; daraja va oliygoh bali chiqadi" />
          )}
          <Toggle checked={shuffle} onChange={setShuffle} label="Aralashtirish" hint="Har bir o'quvchida savol va variantlar tartibi boshqacha" />
          <Toggle checked={isFree} onChange={setIsFree} label="Bepul" hint="Obunasiz ham ochiq" />
          <Toggle checked={isPublished} onChange={setIsPublished} label="Nashr qilish" hint="O'quvchilarga ko'rinadi" />
        </aside>

        <section className="card">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-4 sm:px-5">
            <h2 className="font-extrabold">Savollar</h2>
            <Badge>{items.length} ta{milliy ? " · ball Rasch modeli bilan" : ` · ${total} ball`}</Badge>
            <span className="flex-1" />
            <button className="btn-secondary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> Yangi savol</button>
            <button className="btn-primary btn-sm" onClick={() => setPicker(true)}><Plus size={14} /> Bankdan tanlash</button>
          </div>
          {items.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">Testga hali savol qo'shilmagan</p>}
          <ol className="divide-y divide-slate-100">
            {items.map((it, i) => (
              <li key={it.question.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
                <span className="mt-1 w-6 shrink-0 text-sm font-extrabold text-slate-400">{i + 1}.</span>
                <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                  <p className="line-clamp-2 text-sm font-semibold">{plainText(it.question.text)}</p>
                  <div className="mt-1 flex gap-1.5">
                    <Badge tone="blue">{TYPE_LABELS[it.question.type]}</Badge>
                    {it.question.topicTitle && <Badge>{it.question.topicTitle}</Badge>}
                    <KeyBadge status={it.question.keyStatus} />
                  </div>
                </div>
                {/* Telefonda: matn tagida alohida qator */}
                <div className="ml-9 flex items-center gap-1 sm:ml-0">
                {/* Milliy sertifikat: ballni Rasch modeli beradi, qo'lda ball qo'yilmaydi */}
                {!milliy && <label className="flex items-center gap-1 text-xs font-bold text-slate-500">
                  Ball
                  <input
                    className="input h-9 w-16 px-2"
                    inputMode="decimal"
                    value={it.points}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(",", "."));
                      setItems((cur) => cur.map((c, j) => (j === i ? { ...c, points: Number.isFinite(v) && v > 0 ? v : 1 } : c)));
                    }}
                  />
                </label>}
                <button className="btn-ghost h-9 w-9 p-0" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label="Yuqoriga"><ArrowUp size={14} /></button>
                <button className="btn-ghost h-9 w-9 p-0" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} aria-label="Pastga"><ArrowDown size={14} /></button>
                <button className="btn-ghost h-9 w-9 p-0 text-slate-400 hover:text-red-600" onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))} aria-label="Olib tashlash"><X size={16} /></button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {picker && <Picker defaultTopicId={topicId} exclude={items.map((i) => i.question.id)} onClose={() => setPicker(false)} onPick={add} />}
      {creating && <QuestionModal question={null} defaultTopicId={topicId || null} onClose={() => setCreating(false)} onSaved={(q) => add([q])} />}
    </>
  );
}

function Picker({ defaultTopicId, exclude, onClose, onPick }: { defaultTopicId: string; exclude: string[]; onClose: () => void; onPick: (q: AdminQuestion[]) => void }) {
  const topics = useTopics();
  const [topicId, setTopicId] = useState(defaultTopicId);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Map<string, AdminQuestion>>(new Map());
  const qs = useQuery({ queryKey: ["questions", topicId, search, "picker"], queryFn: () => api.questions({ topicId: topicId || undefined, search: search || undefined }), placeholderData: (p) => p });
  const list = (qs.data?.items ?? []).filter((q) => !exclude.includes(q.id) && q.type !== "MATCHING");

  return (
    <Modal
      title="Bankdan savol tanlash"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-sm font-semibold text-slate-500">{sel.size} ta tanlandi</span>
          <button className="btn-secondary" onClick={onClose}>Bekor qilish</button>
          <button className="btn-primary" disabled={sel.size === 0} onClick={() => { onPick([...sel.values()]); onClose(); }}>Qo'shish</button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input w-full sm:w-auto" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Barcha mavzular</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-3.5 text-slate-400 sm:top-3" />
          <input className="input pl-9" placeholder="Qidirish" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {list.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={() => setSel(new Map(list.map((q) => [q.id, q])))}>Hammasini tanlash</button>
        )}
      </div>
      {qs.isPending && <Spinner className="text-slate-400" />}
      {qs.data && list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Qo'shiladigan savol yo'q</p>}
      <div className="space-y-1">
        {list.map((q) => {
          const on = sel.has(q.id);
          return (
            <label key={q.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${on ? "border-brand bg-brand-soft/30" : "border-slate-200 hover:bg-slate-50"}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[#0f766e]"
                checked={on}
                onChange={() => setSel((m) => { const n = new Map(m); if (on) n.delete(q.id); else n.set(q.id, q); return n; })}
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-semibold">{plainText(q.text)}</span>
                <span className="mt-1 flex gap-1.5"><Badge tone="blue">{TYPE_LABELS[q.type]}</Badge>{q.topicTitle && <Badge>{q.topicTitle}</Badge>}</span>
              </span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}
