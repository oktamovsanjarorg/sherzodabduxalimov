import { currentMonth, formatSum, monthLabel, periodLabel, shortDate, type OfflineLedgerRow } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChevronLeft, ChevronRight, Phone, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PayDialog } from "../components/PayDialog";
import { Badge, Empty, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtShortDateTime } from "../lib/format";
import { useToast } from "../lib/toast";

const shiftMonth = (m: string, by: number) => {
  const d = new Date(`${m}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

/** Offline guruhlar: kim shu oy to'ladi, kim qarzdor */
export function OfflineLedgerView() {
  const toast = useToast();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.groups });
  const active = groups.data?.filter((g) => g.isActive) ?? [];
  const [groupId, setGroupId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [paying, setPaying] = useState<OfflineLedgerRow | null>(null);
  useEffect(() => {
    if (!groupId && active[0]) setGroupId(active[0].id);
  }, [active, groupId]);

  const ledger = useQuery({ queryKey: ["offline-ledger", groupId, month], queryFn: () => api.offlineLedger(groupId, month), enabled: !!groupId });
  const refresh = () => qc.invalidateQueries({ queryKey: ["offline-ledger"] });
  const unmark = useMutation({ mutationFn: (r: OfflineLedgerRow) => api.unmarkOffline(r.studentId, r.paid?.month ?? month), onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  const remind = useMutation({
    mutationFn: () => api.remindDebtors(groupId, month),
    onSuccess: (r) => {
      toast(`${r.students} ta qarzdorga eslatma yuborildi (${r.messages} ta xabar)`);
      refresh();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  if (groups.isPending) return <Spinner className="text-slate-400" />;
  if (!active.length) return <Empty title="Faol guruh yo'q" hint="Guruhlarni Davomat bo'limida yaratib, o'quvchilarni qo'shing. Guruhdagi o'quvchiga ilova obunasiz ochiladi." />;
  const l = ledger.data;
  const isCurrent = month === currentMonth();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto min-w-[180px]" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {active.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.studentCount})
            </option>
          ))}
        </select>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white">
          <button className="btn-ghost h-10 w-10 p-0" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Oldingi oy">
            <ChevronLeft size={18} />
          </button>
          <span className="w-32 text-center text-sm font-bold capitalize">{monthLabel(month)}</span>
          <button className="btn-ghost h-10 w-10 p-0" disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Keyingi oy">
            <ChevronRight size={18} />
          </button>
        </div>
        {l && <FeeEditor groupId={l.group.id} fee={l.group.ownFeeUzs} defaultFee={l.group.defaultFeeUzs} onSaved={refresh} />}
      </div>

      {!l ? (
        <Spinner className="text-slate-400" />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 sm:max-w-lg">
            <Stat label="To'lagan" value={`${l.totals.paid} / ${l.totals.students}`} tone="text-emerald-700" />
            <Stat label="Qarzdor" value={String(l.totals.debtors)} tone={l.totals.debtors ? "text-red-600" : "text-slate-700"} />
            <Stat label="Yig'ildi" value={`${formatSum(l.totals.sumUzs)}`} tone="text-slate-900" />
          </div>
          {l.totals.debtors > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button className="btn-secondary" disabled={remind.isPending} onClick={() => remind.mutate()}>
                <Bell size={16} /> Qarzdorlarga eslatma yuborish
              </button>
              <span className="text-xs text-slate-500">
                Ota-onasiga (tasdiqlangan bo'lsa) va o'quvchining o'ziga bot orqali.
                {l.lastReminderAt && ` Oxirgi marta: ${fmtShortDateTime(l.lastReminderAt)}`}
              </span>
            </div>
          )}
          {!l.rows.length ? (
            <Empty title="Guruhda o'quvchi yo'q" hint="Davomat → Guruhlar bo'limidan qo'shing." />
          ) : (
            <div className="card divide-y divide-slate-100">
              {l.rows.map((r) => (
                <div key={r.studentId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {r.username ? `@${r.username}` : ""}
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="ml-2 inline-flex items-center gap-1 font-semibold text-brand">
                          <Phone size={11} /> {r.phone}
                        </a>
                      )}
                      {!r.approvedParents && <span className="ml-2 text-amber-700">ota-ona tasdiqlanmagan</span>}
                    </p>
                  </div>
                  {r.paid ? (
                    <>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <Badge tone="green">
                          <Check size={11} /> {formatSum(r.paid.amountUzs)} so'm{r.paid.note ? ` · ${r.paid.note}` : ""}
                        </Badge>
                        <span className="text-[11px] text-slate-500">
                          {periodLabel(r.paid.periodStart, r.paid.periodEnd)} davri · to'ladi {shortDate(r.paid.paidOn)}
                        </span>
                        {r.paid.lateDays > 0 && <Badge tone="amber">{r.paid.lateDays} kun kechikib to'ladi</Badge>}
                      </div>
                      <button className="btn-ghost btn-sm" title="Belgini olib tashlash" disabled={unmark.isPending} onClick={() => unmark.mutate(r)}>
                        <Undo2 size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <Badge tone="red">{r.overdueDays ? `Qarzdor · ${r.overdueDays} kun o'tdi` : "Qarzdor"}</Badge>
                        <span className="text-[11px] text-slate-500">{r.coveredUntil ? `To'lov muddati ${shortDate(r.coveredUntil)} da tugagan` : "Hali to'lamagan"}</span>
                      </div>
                      <button className="btn-primary btn-sm" onClick={() => setPaying(r)}>
                        To'ladi
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {paying && <PayDialog studentId={paying.studentId} onClose={() => setPaying(null)} onDone={refresh} />}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-extrabold ${tone}`}>{value}</p>
    </div>
  );
}

/** Guruhga alohida narx (ixtiyoriy). Bo'sh bo'lsa Tariflardagi umumiy oylik narx ishlatiladi */
function FeeEditor({ groupId, fee, defaultFee, onSaved }: { groupId: string; fee: number | null; defaultFee: number | null; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(fee ? String(fee) : "");
  useEffect(() => setV(fee ? String(fee) : ""), [fee, groupId]);
  const save = useMutation({
    mutationFn: () => api.setGroupFee(groupId, v ? Number(v) : null),
    onSuccess: () => {
      toast("Oylik summa saqlandi");
      onSaved();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const changed = (fee ? String(fee) : "") !== v;
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <input
        className="input w-40"
        inputMode="numeric"
        placeholder={defaultFee ? `Umumiy: ${formatSum(defaultFee)}` : "Oylik summa"}
        title="Bo'sh qoldirilsa, Tariflardagi umumiy oylik narx olinadi"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
      />
      <span className="text-sm text-slate-500">{v ? "so'm/oy (shu guruh uchun)" : defaultFee ? "umumiy narx" : "so'm/oy"}</span>
      {changed && (
        <button className="btn-primary btn-sm" disabled={save.isPending}>
          Saqlash
        </button>
      )}
    </form>
  );
}
