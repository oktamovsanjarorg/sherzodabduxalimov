import { formatCard, formatSum, type AdminPlan, type PlanInput } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Pencil, Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Field, Modal, PageHeader, Spinner, Toggle } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

export function BillingSettingsPage() {
  return (
    <>
      <PageHeader title="Tariflar va karta" subtitle="O'quvchilar Mini App'dagi “Obuna” bo'limida shu tariflar va karta raqamini ko'radi." />
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-5">
          <CardForm />
          <EssayPrice />
        </div>
        <Plans />
      </div>
    </>
  );
}

function CardForm() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["billing-settings"], queryFn: api.billingSettings });
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    const c = q.data?.card;
    if (c) {
      setNumber(formatCard(c.number));
      setHolder(c.holder);
      setNote(c.note ?? "");
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.saveBillingSettings({ number, holder, note: note.trim() || null }),
    onSuccess: () => {
      toast("Saqlandi");
      qc.invalidateQueries({ queryKey: ["billing-settings"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const digits = number.replace(/\D/g, "");

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="flex items-center gap-2 font-extrabold">
        <CreditCard size={18} className="text-brand" /> To'lov kartasi
      </h2>
      {q.isPending ? (
        <Spinner className="text-slate-400" />
      ) : (
        <>
          {!q.data?.card && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Karta kiritilmaguncha o'quvchilar to'lov qila olmaydi.</p>}
          <Field label="Karta raqami">
            <input
              className="input text-lg tabular-nums tracking-wider"
              inputMode="numeric"
              placeholder="8600 0000 0000 0000"
              value={number}
              onChange={(e) => setNumber(formatCard(e.target.value.replace(/\D/g, "").slice(0, 16)))}
            />
          </Field>
          <Field label="Karta egasi">
            <input className="input" placeholder="Ism Familiya" value={holder} maxLength={80} onChange={(e) => setHolder(e.target.value)} />
          </Field>
          <Field label="O'quvchiga ko'rsatma" hint="Ixtiyoriy. Masalan: “O'tkazmaga izoh sifatida ismingizni yozing”">
            <textarea className="input min-h-[70px] py-2" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button className="btn-primary" disabled={digits.length !== 16 || holder.trim().length < 3 || save.isPending}>
            <Save size={16} /> Saqlash
          </button>
        </>
      )}
    </form>
  );
}

function EssayPrice() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["essay-settings"], queryFn: api.essaySettings });
  const [v, setV] = useState("");
  useEffect(() => setV(q.data?.priceUzs ? String(q.data.priceUzs) : ""), [q.data]);
  const save = useMutation({
    mutationFn: () => api.saveEssaySettings(v ? Number(v) : null),
    onSuccess: () => {
      toast("Saqlandi");
      qc.invalidateQueries({ queryKey: ["essay-settings"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="font-extrabold">📝 Esseni ustoz tekshirishi</h2>
      <p className="text-sm text-slate-500">O'quvchi varoqqa yozgan essesining rasmini yuboradi va shu summani to'laydi. AI tekshiruvi bepul (kuniga 2 ta).</p>
      <Field label="Bitta esse narxi (so'm)" hint="Bo'sh qoldirilsa, ustoz tekshiruvi o'chiq turadi">
        <input className="input" inputMode="numeric" placeholder="Masalan: 25000" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <button className="btn-primary" disabled={save.isPending || (q.data?.priceUzs ? String(q.data.priceUzs) : "") === v}>
        <Save size={16} /> Saqlash
      </button>
    </form>
  );
}

function Plans() {
  const plans = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const [edit, setEdit] = useState<AdminPlan | "new" | null>(null);
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-extrabold">Tariflar</h2>
        <button className="btn-secondary btn-sm" onClick={() => setEdit("new")}>
          <Plus size={14} /> Yangi tarif
        </button>
      </div>
      {plans.isPending && <Spinner className="text-slate-400" />}
      <div className="divide-y divide-slate-100">
        {plans.data?.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 py-3 ${p.isActive ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">
                {p.name} {!p.isActive && <Badge>yashirin</Badge>}
              </p>
              <p className="truncate text-xs text-slate-500">
                {p.durationDays} kun · faol obunachilar: {p.activeSubscribers}
                {p.description ? ` · ${p.description}` : ""}
              </p>
            </div>
            <span className="shrink-0 font-extrabold">{formatSum(p.priceUzs)} so'm</span>
            <button className="btn-ghost btn-sm" onClick={() => setEdit(p)} aria-label="Tahrirlash">
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>
      {edit && <PlanModal plan={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PlanModal({ plan, onClose }: { plan: AdminPlan | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [d, setD] = useState<PlanInput>({
    name: plan?.name ?? "",
    priceUzs: plan?.priceUzs ?? 150000,
    durationDays: plan?.durationDays ?? 30,
    description: plan?.description ?? null,
    sortOrder: plan?.sortOrder ?? 0,
    isActive: plan?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () => (plan ? api.updatePlan(plan.id, d) : api.createPlan(d)),
    onSuccess: () => {
      toast("Saqlandi");
      qc.invalidateQueries({ queryKey: ["plans"] });
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title={plan ? "Tarifni tahrirlash" : "Yangi tarif"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn-primary" disabled={d.name.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>
            <Save size={16} /> Saqlash
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nomi">
          <input className="input" placeholder="Masalan: Oylik obuna" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Narx (so'm)">
            <input className="input" inputMode="numeric" value={d.priceUzs} onChange={(e) => setD({ ...d, priceUzs: Number(e.target.value.replace(/\D/g, "")) })} />
          </Field>
          <Field label="Muddat (kun)">
            <input className="input" inputMode="numeric" value={d.durationDays} onChange={(e) => setD({ ...d, durationDays: Number(e.target.value.replace(/\D/g, "")) })} />
          </Field>
        </div>
        <Field label="Qisqa izoh" hint="Ixtiyoriy. Masalan: “3 oy · 15% tejaysiz”">
          <input className="input" value={d.description ?? ""} maxLength={300} onChange={(e) => setD({ ...d, description: e.target.value || null })} />
        </Field>
        <Field label="Tartib" hint="Kichik raqam ro'yxatda yuqorida turadi">
          <input className="input" type="number" value={d.sortOrder} onChange={(e) => setD({ ...d, sortOrder: Number(e.target.value) })} />
        </Field>
        <Toggle checked={d.isActive} onChange={(v) => setD({ ...d, isActive: v })} label="O'quvchilarga ko'rinadi" hint="O'chirilsa yangi to'lovlar qabul qilinmaydi, mavjud obunalar ishlayveradi" />
      </div>
    </Modal>
  );
}
