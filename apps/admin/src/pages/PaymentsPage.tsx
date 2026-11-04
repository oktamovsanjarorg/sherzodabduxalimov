import { formatSum, type AdminPayment, type AdminStudent, type AdminSubscription, type PaymentStatusName } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, ImageOff, Phone, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, ConfirmButton, Empty, Field, Modal, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

type Tab = PaymentStatusName | "SUBS";
const REASONS = ["Summa to'liq emas", "Chek o'qilmaydi", "Pul kartaga tushmagan", "Boshqa to'lovning cheki"];
const date = (iso: string) => new Date(iso).toLocaleDateString("ru-RU");
const dateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function PaymentsPage() {
  const [tab, setTab] = useState<Tab>("PENDING");
  const [granting, setGranting] = useState(false);
  const pending = useQuery({ queryKey: ["payments", "PENDING"], queryFn: () => api.payments("PENDING"), refetchInterval: 15_000 });
  const n = pending.data?.length ?? 0;

  return (
    <>
      <PageHeader
        title="To'lovlar"
        subtitle="O'quvchi kartaga pul o'tkazib chek yuboradi. Pul tushganini tekshirib tasdiqlang: obuna avtomatik ochiladi."
        actions={
          <button className="btn-secondary" onClick={() => setGranting(true)}>
            <Gift size={16} /> Qo'lda obuna berish
          </button>
        }
      />
      <div className="mb-4 flex max-w-full overflow-x-auto">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
          {(
            [
              ["PENDING", `Kutilmoqda${n ? ` (${n})` : ""}`],
              ["APPROVED", "Tasdiqlangan"],
              ["REJECTED", "Rad etilgan"],
              ["SUBS", "Obunachilar"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-md px-3 py-1.5 ${tab === k ? "bg-brand text-white" : "text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {tab === "SUBS" ? <Subscribers /> : <PaymentList status={tab} />}
      {granting && <GrantModal onClose={() => setGranting(false)} />}
    </>
  );
}

function PaymentList({ status }: { status: PaymentStatusName }) {
  const list = useQuery({ queryKey: ["payments", status], queryFn: () => api.payments(status) });
  if (list.isPending) return <Spinner className="text-slate-400" />;
  if (!list.data?.length)
    return <Empty title={status === "PENDING" ? "Tekshiriladigan chek yo'q" : "Ro'yxat bo'sh"} hint={status === "PENDING" ? "Yangi cheklar shu yerda paydo bo'ladi, botga ham xabar keladi." : undefined} />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {list.data.map((p) => (
        <PaymentCard key={p.id} p={p} />
      ))}
    </div>
  );
}

function ReceiptImage({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  // blob: URL keshda qoladi (qayta ochilganda qayta yuklanmaydi). Rasm kichik, xotira muammo emas.
  const img = useQuery({ queryKey: ["receipt", id], queryFn: () => api.receipt(id), staleTime: Infinity, gcTime: 10 * 60_000 });
  if (img.isPending) return <div className="flex h-48 items-center justify-center rounded-xl bg-slate-100"><Spinner className="text-slate-400" /></div>;
  if (!img.data) return <div className="flex h-24 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm text-slate-500"><ImageOff size={16} /> Chek yuklanmadi</div>;
  return (
    <>
      <button onClick={() => setOpen(true)} className="block w-full overflow-hidden rounded-xl bg-slate-100" title="Kattalashtirish">
        <img src={img.data} alt="To'lov cheki" className="mx-auto max-h-72 object-contain" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <img src={img.data} alt="To'lov cheki" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

function PaymentCard({ p }: { p: AdminPayment }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const done = () => {
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["subscriptions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const approve = useMutation({
    mutationFn: () => api.approvePayment(p.id),
    onSuccess: (r) => {
      toast(`Tasdiqlandi. Obuna ${date(r.endsAt)} gacha`);
      done();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{p.student.name}</p>
          <p className="truncate text-xs text-slate-500">
            {p.student.username ? `@${p.student.username}` : "username yo'q"}
            {p.student.phone && (
              <a href={`tel:${p.student.phone}`} className="ml-2 inline-flex items-center gap-1 font-semibold text-brand">
                <Phone size={12} /> {p.student.phone}
              </a>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold">{formatSum(p.amountUzs)} so'm</p>
          <p className="text-xs text-slate-500">
            {p.plan.name} · {p.plan.durationDays} kun
          </p>
        </div>
      </div>

      {p.hasReceipt && (
        <div className="mt-3">
          <ReceiptImage id={p.id} />
        </div>
      )}
      {p.payerNote && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">💬 {p.payerNote}</p>}
      {p.status === "PENDING" && p.activeUntil && (
        <p className="mt-2 text-xs text-slate-500">Hozir obunasi bor: {date(p.activeUntil)} gacha. Tasdiqlansa shu sanadan uzaytiriladi.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">{dateTime(p.createdAt)}</span>
        <span className="flex-1" />
        {p.status === "PENDING" ? (
          <div className="flex w-full gap-2 sm:w-auto">
            <button className="btn-danger flex-1 sm:flex-none" onClick={() => setRejecting(true)}>
              <X size={16} /> Rad etish
            </button>
            <button className="btn-primary flex-1 sm:flex-none" onClick={() => approve.mutate()} disabled={approve.isPending}>
              <Check size={16} /> Pul tushdi, tasdiqlash
            </button>
          </div>
        ) : p.status === "APPROVED" ? (
          <Badge tone="green">
            {p.hasReceipt ? "Tasdiqlangan" : p.reviewNote ?? "Qo'lda berilgan"}
            {p.subscription ? ` · ${date(p.subscription.endsAt)} gacha` : ""}
            {p.reviewedBy ? ` · ${p.reviewedBy}` : ""}
          </Badge>
        ) : (
          <Badge tone="red">Rad etilgan: {p.reviewNote}</Badge>
        )}
      </div>
      {rejecting && <RejectModal p={p} onClose={() => setRejecting(false)} onDone={done} />}
    </div>
  );
}

function RejectModal({ p, onClose, onDone }: { p: AdminPayment; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const reject = useMutation({
    mutationFn: () => api.rejectPayment(p.id, reason.trim()),
    onSuccess: () => {
      toast("Rad etildi. O'quvchiga sabab yuborildi");
      onDone();
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title="Chekni rad etish"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={reason.trim().length < 3 || reject.isPending} onClick={() => reject.mutate()}>
            Rad etish
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        <b>{p.student.name}</b> · {formatSum(p.amountUzs)} so'm. Sabab o'quvchiga bot orqali yuboriladi, u chekni qayta yuborishi mumkin.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button key={r} className={`rounded-full border px-3 py-1 text-xs font-semibold ${reason === r ? "border-brand bg-brand-soft text-brand-dark" : "border-slate-200"}`} onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <textarea className="input min-h-[80px] py-2" placeholder="Sabab" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

function Subscribers() {
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const subs = useQuery({ queryKey: ["subscriptions"], queryFn: api.subscriptions });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelSubscription(id),
    onSuccess: () => {
      toast("Obuna bekor qilindi");
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  if (subs.isPending) return <Spinner className="text-slate-400" />;
  const needle = q.trim().toLowerCase();
  const rows = (subs.data ?? []).filter((s) => !needle || `${s.student.name} ${s.student.username ?? ""} ${s.student.phone ?? ""}`.toLowerCase().includes(needle));
  const soon = Date.now() + 5 * 86_400_000;
  return (
    <>
      <div className="relative mb-3 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Ism, username yoki telefon" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="mb-2 text-sm text-slate-500">Faol obunalar: {subs.data?.length ?? 0} ta (tugash sanasi bo'yicha)</p>
      {!rows.length ? (
        <Empty title="Faol obuna yo'q" />
      ) : (
        <div className="card divide-y divide-slate-100">
          {rows.map((s: AdminSubscription) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.student.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {s.student.username ? `@${s.student.username} · ` : ""}
                  {s.planName}
                </p>
              </div>
              <Badge tone={new Date(s.endsAt).getTime() < soon ? "amber" : "green"}>
                {new Date(s.startsAt).getTime() > Date.now() ? `${date(s.startsAt)} dan ` : ""}
                {date(s.endsAt)} gacha
              </Badge>
              <ConfirmButton label="Obuna bekor qilinsinmi?" onConfirm={() => cancel.mutate(s.id)}>
                Bekor qilish
              </ConfirmButton>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function GrantModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [student, setStudent] = useState<AdminStudent | null>(null);
  const [planId, setPlanId] = useState("");
  const [note, setNote] = useState("Naqd to'lov");
  const plans = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const active = plans.data?.filter((p) => p.isActive) ?? [];
  const found = useQuery({ queryKey: ["student-search", search], queryFn: () => api.searchStudents(search), enabled: search.trim().length >= 2 });
  useEffect(() => {
    if (!planId && active[0]) setPlanId(active[0].id);
  }, [active, planId]);
  const grant = useMutation({
    mutationFn: () => api.grantSubscription({ userId: student!.userId, planId, note: note.trim() || null }),
    onSuccess: (r) => {
      toast(`Obuna berildi: ${date(r.endsAt)} gacha`);
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal
      title="Qo'lda obuna berish"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn-primary" disabled={!student || !planId || grant.isPending} onClick={() => grant.mutate()}>
            <Check size={16} /> Obuna berish
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">Naqd to'lagan yoki imtiyozli o'quvchilar uchun. Faol obunasi bo'lsa, uning oxiridan uzaytiriladi.</p>
      <div className="space-y-4">
        <Field label="O'quvchi">
          {student ? (
            <div className="flex items-center gap-2 rounded-lg border border-brand bg-brand-soft px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                {student.name} {student.username ? <span className="font-normal text-slate-500">@{student.username}</span> : null}
              </span>
              <button className="btn-ghost btn-sm" onClick={() => setStudent(null)}>
                O'zgartirish
              </button>
            </div>
          ) : (
            <>
              <input className="input" autoFocus placeholder="Ism, username yoki telefon (kamida 2 belgi)" value={search} onChange={(e) => setSearch(e.target.value)} />
              {found.data && (
                <div className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {found.data.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Topilmadi</p>}
                  {found.data.map((s) => (
                    <button key={s.userId} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setStudent(s)}>
                      <b>{s.name}</b> <span className="text-slate-500">{[s.username && `@${s.username}`, s.phone, s.groupName].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Field>
        <Field label="Tarif">
          <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.durationDays} kun · {formatSum(p.priceUzs)} so'm
              </option>
            ))}
          </select>
        </Field>
        <Field label="Izoh">
          <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
