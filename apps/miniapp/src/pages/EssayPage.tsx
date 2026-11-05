import { ESSAY_STATUS_LABELS, MAX_ESSAY_PAGES, NO_ESSAY_ERROR, formatCard, formatSum, type EssayConfig, type EssayReviewView, type MyEssayDetail } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Clock, GraduationCap, ImagePlus, Loader2, RotateCcw, Trash2, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CopyLine } from "../components/CopyLine";
import { FullPage } from "../components/FullPage";
import { VoiceNote } from "../components/VoiceNote";
import { api, ApiError } from "../lib/api";
import { formatDate, useBackButton } from "../lib/hooks";
import { compressImage } from "../lib/image";
import { confirmDialog, hapticResult } from "../lib/telegram";

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Xatolik, internetni tekshiring");

export function EssayPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  useBackButton(() => navigate("/essays"));
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["essay", id],
    queryFn: () => api.essay(id),
    // AI tekshirayotganda yoki to'lov/ustoz kutilayotganda o'zi yangilanadi
    refetchInterval: (s) => {
      const st = s.state.data?.status;
      return st === "AI_CHECKING" ? 4000 : st === "SUBMITTED" || (st === "AWAITING_PAYMENT" && s.state.data?.payment?.status === "PENDING") ? 20_000 : false;
    },
  });
  const set = (e: MyEssayDetail) => {
    qc.setQueryData(["essay", id], e);
    qc.invalidateQueries({ queryKey: ["essays"] });
  };
  const e = q.data;

  return (
    <FullPage>
      {q.isPending && <div className="skeleton h-64" />}
      {q.isError && <p className="card text-center text-sm text-danger">{errText(q.error)}</p>}
      {e && (
        <>
          <div className="flex items-center gap-2 px-1 text-xs font-semibold text-hint">
            {e.mode === "AI" ? <Bot size={14} /> : <GraduationCap size={14} />}
            {e.mode === "AI" ? "AI tekshiruvi" : "Ustoz tekshiruvi"} · {formatDate(e.createdAt)}
          </div>
          <h1 className="mt-1 px-1 text-xl font-extrabold">{e.prompt}</h1>

          {e.status === "DRAFT" && <DraftPages e={e} onChange={set} />}
          {e.status === "AWAITING_PAYMENT" && <EssayPay e={e} onChange={() => q.refetch()} />}
          {e.status === "SUBMITTED" && <Waiting icon={<GraduationCap size={36} className="mx-auto text-brand" />} title="Ustoz tekshirmoqda" hint="Tekshirilgach bot orqali xabar keladi." />}
          {e.status === "AI_CHECKING" && Date.now() - new Date(e.createdAt).getTime() > 20 * 60_000 && <Failed e={{ ...e, error: "Tekshiruv juda uzoq cho'zildi. Qayta yuborib ko'ring." }} onChange={set} />}
          {e.status === "AI_CHECKING" && Date.now() - new Date(e.createdAt).getTime() <= 20 * 60_000 && (
            <Waiting
              icon={<Loader2 size={36} className="mx-auto animate-spin text-brand" />}
              title={e.pages && !e.text ? "AI qo'lyozmani o'qimoqda…" : "AI tekshirmoqda…"}
              hint={`Odatda ${e.pages ? "30–60" : "10–30"} soniya. Sahifani yopsangiz ham natija bot orqali keladi.`}
            />
          )}
          {e.status === "AI_FAILED" && <Failed e={e} onChange={set} />}

          {e.voice && (
            <div className="mt-4">
              <VoiceNote voice={e.voice} />
            </div>
          )}
          {[...e.reviews].reverse().map((r) => (
            <ReviewCard key={r.source} r={r} />
          ))}

          {e.status !== "DRAFT" && e.pages > 0 && (
            <>
              <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">Yuborilgan varoqlar</p>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: e.pages }, (_, n) => (
                  <PageThumb key={n} id={e.id} n={n} />
                ))}
              </div>
            </>
          )}
          {e.mode === "AI" && e.text && (
            <details className="card mt-6">
              <summary className="cursor-pointer text-sm font-bold">{e.pages ? "AI qo'lyozmadan o'qigan matn" : "Yuborilgan matn"}</summary>
              {e.pages > 0 && <p className="mt-2 text-xs text-hint">[?] — AI o'qiy olmagan so'z. Bunday so'zlar xato hisoblanmaydi.</p>}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{e.text}</p>
            </details>
          )}
          {(e.status === "DRAFT" || e.status === "AI_FAILED" || (e.status === "AWAITING_PAYMENT" && e.payment?.status !== "PENDING")) && (
            <DeleteButton id={e.id} />
          )}
        </>
      )}
    </FullPage>
  );
}

function Waiting({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="card mt-4 text-center">
      {icon}
      <p className="mt-2 font-bold">{title}</p>
      <p className="mt-1 text-sm text-hint">{hint}</p>
    </div>
  );
}

function Failed({ e, onChange }: { e: MyEssayDetail; onChange: (e: MyEssayDetail) => void }) {
  const navigate = useNavigate();
  const retry = useMutation({ mutationFn: () => api.retryEssay(e.id), onSuccess: onChange });
  // Rasmda esse yo'q: xuddi shu rasmni qayta yuborish befoyda, yangi rasm kerak
  const noEssay = e.error === NO_ESSAY_ERROR;
  return (
    <div className="card mt-4 text-center">
      <XCircle size={36} className="mx-auto text-danger" />
      <p className="mt-2 font-bold">{noEssay ? "Rasmda esse topilmadi" : ESSAY_STATUS_LABELS.AI_FAILED}</p>
      <p className="mt-1 text-sm text-hint">
        {noEssay
          ? "Yuklangan rasmda esse matni ko'rinmadi (boshqa material, xira yoki bo'sh varoq bo'lishi mumkin). Esse yozilgan varoqni yorug' joyda, tekis qilib suratga oling. Bu urinish kunlik limitga hisoblanmadi."
          : e.error}
      </p>
      {noEssay ? (
        <button className="btn-primary mt-3" onClick={() => navigate("/essays/new", { replace: true })}>
          Yangi rasm bilan yuborish
        </button>
      ) : (
        <button className="btn-ghost mt-3" disabled={retry.isPending} onClick={() => retry.mutate()}>
          <RotateCcw size={16} /> Qayta urinish
        </button>
      )}
      {retry.isError && <p className="mt-2 text-sm text-danger">{errText(retry.error)}</p>}
    </div>
  );
}

function ReviewCard({ r }: { r: EssayReviewView }) {
  const ai = r.source === "AI";
  return (
    <div className="mt-4 space-y-3">
      <div className="card flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full bg-brand text-white">
          <span className="text-xl font-extrabold leading-none">{fmt(r.totalScore)}</span>
          <span className="text-[10px] font-bold opacity-80">/ {r.maxScore}</span>
        </div>
        <div className="min-w-0">
          <p className="font-bold">{ai ? "AI bahosi" : `Ustoz bahosi${r.reviewer ? ` · ${r.reviewer}` : ""}`}</p>
          <p className="text-xs text-hint">{ai ? "Taxminiy. Aniq baho uchun ustozga yuboring." : formatDate(r.createdAt)}</p>
        </div>
      </div>
      {r.special && (
        <p className="card text-sm font-semibold text-danger">
          {r.special.label}: rasmiy mezon bo'yicha esse tekshirilmaydi va {r.totalScore} ball bilan baholanadi.
        </p>
      )}
      {r.criteria.length > 0 && <div className="card divide-y divide-hint/10 py-1">
        {r.criteria.map((c) => (
          <div key={c.key} className="py-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold">{c.label}</span>
              <span className="text-sm font-extrabold">
                {fmt(c.score)}
                <span className="text-hint">/{c.max}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hint/15">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(c.score / c.max) * 100}%` }} />
            </div>
            {c.comment && <p className="mt-1.5 text-xs text-hint">{c.comment}</p>}
          </div>
        ))}
      </div>}
      {r.feedback && (
        <div className="card">
          <p className="mb-1 text-sm font-bold">Xulosa</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.feedback}</p>
        </div>
      )}
      {r.mistakes.length > 0 && (
        <div className="card">
          <p className="mb-2 text-sm font-bold">Topilgan xatolar</p>
          <ul className="space-y-2">
            {r.mistakes.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="text-danger line-through">{m.wrong}</span> → <span className="font-semibold text-success">{m.right}</span>
                {m.note && <span className="block text-xs text-hint">{m.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PageThumb({ id, n, onRemove }: { id: string; n: number; onRemove?: () => void }) {
  const img = useQuery({ queryKey: ["essay-page", id, n], queryFn: () => api.essayPage(id, n), staleTime: Infinity });
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-section">
      {img.data ? <img src={img.data} alt={`${n + 1}-varoq`} className="h-full w-full object-contain" /> : <div className="skeleton h-full w-full" />}
      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{n + 1}</span>
      {onRemove && (
        <button onClick={onRemove} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white" aria-label="O'chirish">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function DraftPages({ e, onChange }: { e: MyEssayDetail; onChange: (e: MyEssayDetail) => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Rasm o'chirilganda tartib o'zgaradi: eski kesh tozalanadi
  const resetThumbs = () => qc.removeQueries({ queryKey: ["essay-page", e.id] });

  const add = async (files: FileList | null) => {
    setErr(null);
    if (!files?.length) return;
    setBusy(true);
    try {
      let last = e;
      for (const f of [...files].slice(0, MAX_ESSAY_PAGES - e.pages)) last = await api.addEssayPage(e.id, await compressImage(f, 2200, 0.85));
      onChange(last);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  };
  const remove = useMutation({
    mutationFn: (n: number) => api.removeEssayPage(e.id, n),
    onSuccess: (d) => {
      resetThumbs();
      onChange(d);
    },
  });
  const finish = useMutation({ mutationFn: () => api.finishEssay(e.id), onSuccess: onChange, onError: (x) => setErr(errText(x)) });

  return (
    <>
      <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">
        Varoq rasmlari ({e.pages}/{MAX_ESSAY_PAGES})
      </p>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: e.pages }, (_, n) => (
          <PageThumb key={`${n}-${e.pages}`} id={e.id} n={n} onRemove={() => remove.mutate(n)} />
        ))}
        {e.pages < MAX_ESSAY_PAGES && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="tap flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-hint/30 text-hint"
          >
            {busy ? <Loader2 size={28} className="animate-spin" /> : <ImagePlus size={28} />}
            <span className="px-2 text-center text-xs font-semibold">{busy ? "Yuklanmoqda…" : "Varoq rasmini qo'shish"}</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(x) => add(x.target.files).finally(() => (x.target.value = ""))} />
      <p className="mt-2 px-1 text-xs text-hint">Varoqni yorug' joyda, tekis qilib, butun sahifa ko'rinadigan qilib suratga oling.</p>
      {err && <p className="mt-2 px-1 text-sm text-danger">{err}</p>}
      <button className="btn-primary mt-4" disabled={!e.pages || finish.isPending || busy} onClick={() => finish.mutate()}>
        {finish.isPending && <Loader2 size={18} className="animate-spin" />}
        {e.mode === "AI" ? "AI'ga tekshirishga yuborish" : "Davom etish: to'lov"}
      </button>
    </>
  );
}

function EssayPay({ e, onChange }: { e: MyEssayDetail; onChange: () => void }) {
  const cfg = useQuery({ queryKey: ["essay-config"], queryFn: api.essayConfig });
  const p = e.payment;
  if (p?.status === "PENDING")
    return <Waiting icon={<Clock size={36} className="mx-auto text-brand" />} title="Chekingiz tekshirilmoqda" hint="Tasdiqlangach esse ustozga yuboriladi." />;
  return (
    <>
      {p?.status === "REJECTED" && (
        <p className="card mt-4 text-sm text-danger">
          Chek qabul qilinmadi{p.reviewNote ? `: ${p.reviewNote}` : ""}. Qayta yuboring.
        </p>
      )}
      {cfg.data && <PayBox e={e} card={cfg.data.card} onDone={onChange} />}
    </>
  );
}

function PayBox({ e, card, onDone }: { e: MyEssayDetail; card: EssayConfig["card"]; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file],
  );
  const send = useMutation({
    mutationFn: () => api.submitPayment({ essayId: e.id }, file!.blob, ""),
    onSuccess: () => {
      hapticResult("success");
      onDone();
    },
    onError: (x) => setErr(errText(x)),
  });
  if (!card) return <p className="card mt-4 text-center text-sm text-hint">To'lov hali sozlanmagan</p>;
  return (
    <>
      <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">Kartaga {formatSum(e.priceUzs ?? 0)} so'm o'tkazing</p>
      <div className="card">
        <p className="text-xs text-hint">Karta raqami</p>
        <CopyLine text={card.number} display={formatCard(card.number)} />
        <p className="mt-1 text-sm font-semibold">{card.holder}</p>
        {card.note && <p className="mt-2 text-xs text-hint">{card.note}</p>}
      </div>
      <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">Chek rasmini yuklang</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={async (x) => {
          const f = x.target.files?.[0];
          x.target.value = "";
          if (!f) return;
          try {
            const blob = await compressImage(f);
            setFile({ blob, url: URL.createObjectURL(blob) });
          } catch (y) {
            setErr((y as Error).message);
          }
        }}
      />
      {file ? (
        <button className="card w-full" onClick={() => fileRef.current?.click()}>
          <img src={file.url} alt="Chek" className="max-h-64 w-full rounded-xl object-contain" />
          <span className="mt-2 block text-sm font-semibold text-brand">Boshqa rasm tanlash</span>
        </button>
      ) : (
        <button onClick={() => fileRef.current?.click()} className="card tap flex w-full flex-col items-center gap-2 border-2 border-dashed border-hint/30 py-8 text-hint">
          <ImagePlus size={32} />
          <span className="text-sm font-semibold">To'lov chekining skrinshotini tanlang</span>
        </button>
      )}
      {err && <p className="mt-2 px-1 text-sm text-danger">{err}</p>}
      <button className="btn-primary mt-4" disabled={!file || send.isPending} onClick={() => send.mutate()}>
        {send.isPending && <Loader2 size={18} className="animate-spin" />}
        Chekni yuborish
      </button>
    </>
  );
}

function DeleteButton({ id }: { id: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.deleteEssay(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["essays"] });
      navigate("/essays", { replace: true });
    },
  });
  return (
    <button
      className="mx-auto mt-6 flex items-center gap-1 text-sm font-semibold text-danger disabled:opacity-50"
      disabled={del.isPending}
      onClick={async () => {
        if (await confirmDialog("Bu esse o'chirilsinmi?")) del.mutate();
      }}
    >
      <Trash2 size={14} /> Esseni o'chirish
    </button>
  );
}
