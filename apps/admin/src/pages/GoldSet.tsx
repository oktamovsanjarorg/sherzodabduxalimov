import type { GoldList, GoldRow } from "@onatili/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Download, FlaskConical, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Empty, Field, Modal, Spinner } from "../components/ui";
import { errMsg } from "../lib/api";
import { fmtShortDateTime } from "../lib/format";
import { goldApi } from "../lib/gold-api";
import { loadSession } from "../lib/session";
import { useToast } from "../lib/toast";

/**
 * Sinov to'plami: AI tekshiruvi qanchalik to'g'riligini o'lchash uchun ustozlar tayyorlaydigan esselar.
 * Har bir esse: aynan ko'chirilgan matn (xatolari belgilangan) + ikki ustozning bir-birini ko'rmasdan qo'ygan bahosi.
 */
export function GoldSet() {
  const q = useQuery({ queryKey: ["gold"], queryFn: goldApi.list });
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-700">{errMsg(q.error)}</p>;
  const { summary, rows } = q.data;
  return (
    <div className="space-y-4">
      <Progress s={summary} onAdd={() => setAdding(true)} />
      {rows.length === 0 ? (
        <Empty
          Icon={FlaskConical}
          title="Hali sinov essesi yo'q"
          hint="«Barcha esselar» bo'limida esseni ochib «Sinov to'plamiga qo'shish»ni bosing yoki qog'ozdagi esseni rasmga olib qo'shing."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Row key={r.id} r={r} onOpen={() => navigate(`/essays/gold/${r.id}`)} />
          ))}
        </div>
      )}
      {adding && <AddPaper onClose={() => setAdding(false)} onCreated={(id) => navigate(`/essays/gold/${id}`)} />}
    </div>
  );
}

function Progress({ s, onAdd }: { s: GoldList["summary"]; onAdd: () => void }) {
  const toast = useToast();
  const isTeacher = loadSession()?.user.role === "TEACHER";
  const exp = useMutation({
    mutationFn: goldApi.exportZip,
    onSuccess: (r) =>
      toast(`${r.essays} ta esse yuklab olindi${r.skippedMarks ? ` · ${r.skippedMarks} ta belgi (uslub, mantiq yoki ustma-ust) o'lchovga kirmadi` : ""}`),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const pct = Math.min(100, Math.round((s.ready / s.target) * 100));
  return (
    <div className="card space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-3">O'lchovga tayyor</p>
          <p className="text-3xl font-extrabold">
            {s.ready} <span className="text-base font-semibold text-ink-3">/ {s.target} ta esse</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={onAdd}>
            <Plus size={16} /> Qog'ozdagi esse
          </button>
          {isTeacher && (
            <button className="btn-secondary btn-sm" disabled={!s.ready || exp.isPending} onClick={() => exp.mutate()}>
              <Download size={16} /> {exp.isPending ? "Tayyorlanmoqda…" : "O'lchov uchun yuklab olish"}
            </button>
          )}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-ink-3">
        Jami {s.total} · ko'chirilgan {s.transcribed} · ikki baho {s.doubleRated}. Kamida {s.min} ta tayyor esse bo'lmaguncha o'lchovdan xulosa chiqarilmaydi.
      </p>
      <ol className="list-decimal space-y-0.5 pl-5 text-sm text-ink-2">
        <li>Esseni qo'shing (botdagi yoki qog'ozdagi, o'quvchi roziligi bilan).</li>
        <li>Varoqdagi matnni harfma-harf ko'chiring va xatolarni belgilang.</li>
        <li>Ikki ustoz alohida baholaydi: bir-birining bahosi baholamaguncha ko'rinmaydi, AI bahosi umuman ko'rsatilmaydi.</li>
      </ol>
    </div>
  );
}

function Row({ r, onOpen }: { r: GoldRow; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-brand sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">«{r.topic}»</p>
        <p className="truncate text-xs text-ink-3">
          {fmtShortDateTime(r.createdAt)} · {r.pages ? `${r.pages} varoq` : "yozma"} · {r.fromBot ? "botdan" : "qog'ozdan"}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={r.transcribed ? "green" : "amber"}>{r.transcribed ? `Ko'chirildi · ${r.marks} xato` : "Ko'chirilmagan"}</Badge>
        <Badge tone={r.ratings >= 2 ? "green" : "gray"}>
          {r.ratedByMe && <Check size={12} />} Baho {r.ratings}/2
        </Badge>
      </div>
      <ChevronRight size={16} className="shrink-0 text-ink-4" />
    </button>
  );
}

function AddPaper({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [topic, setTopic] = useState("");
  const [consent, setConsent] = useState(false);
  const create = useMutation({
    mutationFn: () => goldApi.create({ topic, consent: true }),
    onSuccess: (g) => onCreated(g.id),
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title="Qog'ozdagi esse"
      onClose={onClose}
      footer={
        <button className="btn-primary w-full sm:w-auto" disabled={topic.trim().length < 3 || !consent || create.isPending} onClick={() => create.mutate()}>
          Davom etish: varoqlarni yuklash
        </button>
      }
    >
      <div className="space-y-4">
        <Field label="Topshiriq (vaziyat) matni" hint="O'quvchiga berilgan topshiriq aynan qanday bo'lsa, shunday">
          <textarea className="input min-h-28 text-[16px] sm:text-[15px]" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>O'quvchi (yoki ota-onasi) ishidan AI sifatini o'lchash uchun foydalanishga rozi. Ismi o'lchov fayllariga kirmaydi.</span>
        </label>
      </div>
    </Modal>
  );
}
