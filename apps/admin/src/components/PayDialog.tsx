import { daysBetween, defaultPeriodEnd, formatSum, shortDate, tashkentToday } from "@onatili/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { Field, Modal, Spinner } from "./ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

/**
 * Offline guruh to'lovini belgilash: qaysi davr uchun (o'quvchining o'z sanasidan, masalan 05.11 – 04.12)
 * va qachon to'lagani. To'lov davr boshidan keyin bo'lsa, kechikkan deb belgilanadi.
 * Hamma joyda (To'lovlar, o'quvchi kartasi, qarzdorlar, Hammasi) shu bitta oyna ishlatiladi.
 */
export function PayDialog({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const info = useQuery({ queryKey: ["offline-next", studentId], queryFn: () => api.offlineNextPeriod(studentId), gcTime: 0 });
  return (
    <Modal title="To'lovni belgilash" onClose={onClose}>
      {info.isPending ? (
        <Spinner className="text-slate-400" />
      ) : info.isError ? (
        <p className="text-sm font-semibold text-red-600">{errMsg(info.error)}</p>
      ) : (
        <Form studentId={studentId} info={info.data} onClose={onClose} onDone={onDone} />
      )}
    </Modal>
  );
}

function Form({ studentId, info, onClose, onDone }: { studentId: string; info: Awaited<ReturnType<typeof api.offlineNextPeriod>>; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const today = tashkentToday();
  const [amount, setAmount] = useState(info.feeUzs ? String(info.feeUzs) : "");
  const [note, setNote] = useState("Naqd");
  const [start, setStart] = useState(info.nextPeriodStart);
  const [end, setEnd] = useState(defaultPeriodEnd(info.nextPeriodStart));
  const [paidOn, setPaidOn] = useState(today);
  const late = start && paidOn ? Math.max(0, daysBetween(start, paidOn)) : 0;
  const badRange = !!start && !!end && end < start;
  const bad = !start || !end || !paidOn || badRange || paidOn > today || !Number(amount || 0) && !info.feeUzs;
  const save = useMutation({
    mutationFn: () => api.markOffline({ studentId, periodStart: start, periodEnd: end, paidOn, amountUzs: Number(amount || 0) || undefined, note: note.trim() || null }),
    onSuccess: (r) => {
      toast(`${info.approvedParents ? "Belgilandi. Ota-onaga xabar yuborildi" : "Belgilandi"}${r.lateDays ? ` (${r.lateDays} kun kechikkan)` : ""}`);
      onDone();
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <>
      <p className="mb-1 text-sm text-slate-700">
        <b>{info.name}</b>
        {info.feeUzs ? ` · oylik ${formatSum(info.feeUzs)} so'm` : ""}
      </p>
      <p className="mb-4 text-xs text-slate-500">
        {info.coveredUntil ? `Oxirgi to'langan davr ${shortDate(info.coveredUntil)} gacha edi: yangi davr shundan keyingi kundan boshlandi.` : "Hali to'lamagan: davr boshini o'zi boshlagan kundan qo'ying."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Davr boshi">
          <input className="input" type="date" value={start} onChange={(e) => (setStart(e.target.value), e.target.value && setEnd(defaultPeriodEnd(e.target.value)))} />
        </Field>
        <Field label="Davr oxiri">
          <input className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="To'lov sanasi">
          <input className="input" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Summa (so'm)">
          <input className="input" inputMode="numeric" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      {late > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Davr boshidan {late} kun keyin to'laydi: «kechikib to'ladi» deb belgilanadi.</p>}
      {badRange && <p className="mt-3 text-xs font-semibold text-red-600">Davr oxiri boshidan oldin bo'lishi mumkin emas.</p>}
      <div className="mt-3">
        <Field label="Izoh">
          <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["Naqd", "Kartaga", "Chegirma"].map((n) => (
          <button key={n} type="button" className={`rounded-full border px-3 py-1 text-xs font-semibold ${note === n ? "border-brand bg-brand-soft text-brand-dark" : "border-slate-200"}`} onClick={() => setNote(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Bekor qilish
        </button>
        <button className="btn-primary" disabled={save.isPending || bad} onClick={() => save.mutate()}>
          <Check size={16} /> To'ladi
        </button>
      </div>
    </>
  );
}
