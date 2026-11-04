import { formatCard, formatSum, monthLabel, STAFF_ROLES, type BillingView, type MyOfflineBilling, type MyPayment } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Clock, Copy, ImagePlus, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { api, ApiError } from "../lib/api";
import { formatDate, useBackButton } from "../lib/hooks";
import { compressImage } from "../lib/image";
import { confirmDialog, haptic, hapticResult } from "../lib/telegram";
import { useAuth } from "../store/auth";

const perks = [
  "Barcha videodarslar va konspektlar",
  "Mavzulashtirilgan testlar",
  "Milliy sertifikat formatidagi mock imtihonlar",
  "Natijalar tahlili va statistika",
];

export function SubscribePage() {
  const navigate = useNavigate();
  useBackButton(() => navigate(-1));
  const qc = useQueryClient();
  const billing = useQuery({
    queryKey: ["billing"],
    queryFn: api.billing,
    // Chek tekshirilayotganda holatni o'zi yangilab turadi
    refetchInterval: (q) => (q.state.data?.pending ? 15_000 : false),
  });
  useSyncSubscription(billing.data);

  const b = billing.data;
  const isStaff = useAuth((s) => (s.user ? STAFF_ROLES.includes(s.user.role) : false));
  return (
    <FullPage>
      <h1 className="px-1 text-xl font-extrabold">Obuna</h1>
      {billing.isPending && <div className="skeleton mt-4 h-64" />}
      {billing.isError && <p className="card mt-4 text-center text-sm text-danger">Ma'lumotni yuklab bo'lmadi</p>}
      {b && (
        <>
          {b.offline ? (
            <OfflineCard o={b.offline} />
          ) : b.subscription ? (
            <div className="card mt-4 flex items-center gap-3">
              <CheckCircle2 size={28} className="shrink-0 text-success" />
              <div>
                <p className="font-bold">Obunangiz faol</p>
                <p className="text-sm text-hint">
                  {b.subscription.planName} · {formatDate(b.subscription.endsAt)} gacha
                </p>
              </div>
            </div>
          ) : (
            <div className="card mt-4 space-y-3">
              {perks.map((p) => (
                <p key={p} className="flex items-center gap-3 text-sm font-semibold">
                  <CheckCircle2 size={20} className="shrink-0 text-brand" /> {p}
                </p>
              ))}
            </div>
          )}

          {b.offline ? null : isStaff ? (
            <p className="card mt-4 text-center text-sm text-hint">Siz xodimsiz: barcha kontent obunasiz ochiq. To'lov formasi o'quvchilarga ko'rinadi.</p>
          ) : b.pending ? (
            <PendingCard p={b.pending} onCancelled={() => qc.invalidateQueries({ queryKey: ["billing"] })} />
          ) : (
            <PayForm b={b} />
          )}

          {b.history.some((h) => h.status !== "PENDING") && (
            <>
              <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">To'lovlar tarixi</p>
              <div className="card divide-y divide-hint/10 py-1">
                {b.history
                  .filter((h) => h.status !== "PENDING")
                  .map((h) => (
                    <HistoryRow key={h.id} p={h} />
                  ))}
              </div>
            </>
          )}
        </>
      )}
    </FullPage>
  );
}

/** Obuna tasdiqlansa: yuqoridagi "Obuna faol" belgisi va yopiq darslar darhol yangilanadi */
function useSyncSubscription(b: BillingView | undefined) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  useEffect(() => {
    if (!b || !user) return;
    const prev = user.subscription?.endsAt ?? null;
    const next = b.subscription?.endsAt ?? null;
    if (prev === next) return;
    useAuth.setState({ user: { ...user, subscription: b.subscription } });
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "billing" });
  }, [b, user, qc]);
}

function OfflineCard({ o }: { o: MyOfflineBilling }) {
  return (
    <>
      <div className="card mt-4 flex items-center gap-3">
        <CheckCircle2 size={28} className="shrink-0 text-success" />
        <div>
          <p className="font-bold">Offline guruh: {o.groupName}</p>
          <p className="text-sm text-hint">Barcha darslar va testlar ochiq. To'lov darsda qabul qilinadi.</p>
        </div>
      </div>
      <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">Oylik to'lovlar{o.monthlyFeeUzs ? ` · ${formatSum(o.monthlyFeeUzs)} so'm` : ""}</p>
      <div className="card divide-y divide-hint/10 py-1">
        {o.months.map((m) => (
          <div key={m.month} className="flex items-center gap-3 py-3">
            {m.paid ? <CheckCircle2 size={20} className="shrink-0 text-success" /> : <Clock size={20} className="shrink-0 text-hint" />}
            <span className="flex-1 text-sm font-semibold capitalize">{monthLabel(m.month)}</span>
            <span className={`text-xs font-bold ${m.paid ? "text-success" : "text-hint"}`}>
              {m.paid ? `To'langan${m.amountUzs ? ` · ${formatSum(m.amountUzs)}` : ""}` : "To'lanmagan"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function PayForm({ b }: { b: BillingView }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [planId, setPlanId] = useState(b.plans[0]?.id ?? "");
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const plan = b.plans.find((p) => p.id === planId);

  useEffect(() => () => {
    if (file) URL.revokeObjectURL(file.url);
  }, [file]);

  const send = useMutation({
    mutationFn: () => api.submitPayment(planId, file!.blob, note.trim()),
    onSuccess: () => {
      hapticResult("success");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Yuborib bo'lmadi, internetni tekshiring"),
  });

  if (!b.plans.length || !b.card) {
    return (
      <div className="card mt-4 text-center">
        <p className="font-bold">To'lov hali sozlanmagan</p>
        <p className="mt-1 text-sm text-hint">Obuna uchun ustozning yordamchisiga murojaat qiling.</p>
      </div>
    );
  }

  const pick = async (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    try {
      const blob = await compressImage(f);
      setFile({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">{b.subscription ? "1. Obunani uzaytirish" : "1. Tarifni tanlang"}</p>
      <div className="space-y-2">
        {b.plans.map((p) => {
          const on = p.id === planId;
          return (
            <button
              key={p.id}
              onClick={() => {
                haptic();
                setPlanId(p.id);
              }}
              className={`card tap flex w-full items-center gap-3 border-2 text-left ${on ? "border-brand" : "border-transparent"}`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-brand bg-brand text-white" : "border-hint/40"}`}>
                {on && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{p.name}</span>
                <span className="block text-xs text-hint">{p.description ?? `${p.durationDays} kun`}</span>
              </span>
              <span className="shrink-0 text-right font-extrabold">
                {formatSum(p.priceUzs)}
                <span className="block text-[11px] font-semibold text-hint">so'm</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">2. Kartaga pul o'tkazing</p>
      <div className="card">
        <p className="text-xs text-hint">Karta raqami</p>
        <CopyLine text={b.card.number} display={formatCard(b.card.number)} />
        <p className="mt-1 text-sm font-semibold">{b.card.holder}</p>
        {plan && (
          <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-sm">
            O'tkaziladigan summa: <b>{formatSum(plan.priceUzs)} so'm</b>
          </p>
        )}
        {b.card.note && <p className="mt-2 text-xs text-hint">{b.card.note}</p>}
      </div>

      <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">3. Chek rasmini yuklang</p>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      {file ? (
        <div className="card">
          <img src={file.url} alt="Chek" className="max-h-80 w-full rounded-xl object-contain" />
          <button className="mt-2 w-full py-2 text-sm font-semibold text-brand" onClick={() => fileRef.current?.click()}>
            Boshqa rasm tanlash
          </button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} className="card tap flex w-full flex-col items-center gap-2 border-2 border-dashed border-hint/30 py-8 text-hint">
          <ImagePlus size={32} />
          <span className="text-sm font-semibold">To'lov chekining skrinshotini tanlang</span>
        </button>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="Izoh (ixtiyoriy): kimning kartasidan to'landi"
        className="mt-3 h-12 w-full rounded-xl border-2 border-transparent bg-section px-4 text-[16px] outline-none focus:border-brand"
      />
      {err && <p className="mt-2 px-1 text-sm text-danger">{err}</p>}
      <button className="btn-primary mt-4" disabled={!file || !plan || send.isPending} onClick={() => send.mutate()}>
        {send.isPending && <Loader2 size={18} className="animate-spin" />}
        Chekni yuborish
      </button>
      <p className="mt-2 px-1 text-center text-xs text-hint">Ustoz chekni tekshirgach obuna avtomatik ochiladi va bot orqali xabar keladi.</p>
    </>
  );
}

function CopyLine({ text, display }: { text: string; display: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ba'zi Telegram webview'larida clipboard API yopiq: eski usul
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    hapticResult("success");
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button onClick={copy} className="tap mt-1 flex w-full items-center justify-between gap-2 text-left">
      <span className="text-xl font-extrabold tabular-nums tracking-wider">{display}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-brand">
        {done ? <Check size={16} /> : <Copy size={16} />}
        {done ? "Nusxalandi" : "Nusxalash"}
      </span>
    </button>
  );
}

function PendingCard({ p, onCancelled }: { p: MyPayment; onCancelled: () => void }) {
  const cancel = useMutation({ mutationFn: () => api.cancelPayment(p.id), onSuccess: onCancelled });
  return (
    <div className="card mt-4 text-center">
      <Clock size={36} className="mx-auto text-brand" />
      <p className="mt-2 font-bold">Chekingiz tekshirilmoqda</p>
      <p className="mt-1 text-sm text-hint">
        {p.planName} · {formatSum(p.amountUzs)} so'm · {formatDate(p.createdAt)}
      </p>
      <p className="mt-2 text-sm text-hint">Tasdiqlangach obuna avtomatik ochiladi, bot orqali xabar keladi.</p>
      <button
        className="mt-3 text-sm font-semibold text-danger disabled:opacity-50"
        disabled={cancel.isPending}
        onClick={async () => {
          if (await confirmDialog("Yuborilgan chekni bekor qilasizmi? Keyin yangisini yuborishingiz mumkin.")) cancel.mutate();
        }}
      >
        Noto'g'ri rasm yubordim — bekor qilish
      </button>
    </div>
  );
}

function HistoryRow({ p }: { p: MyPayment }) {
  const ok = p.status === "APPROVED";
  return (
    <div className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" /> : <XCircle size={20} className="mt-0.5 shrink-0 text-danger" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {p.planName} · {formatSum(p.amountUzs)} so'm
        </p>
        <p className="text-xs text-hint">
          {formatDate(p.createdAt)} · {ok ? "Tasdiqlangan" : "Rad etilgan"}
        </p>
        {!ok && p.reviewNote && <p className="mt-1 text-xs text-danger">Sabab: {p.reviewNote}</p>}
      </div>
    </div>
  );
}
