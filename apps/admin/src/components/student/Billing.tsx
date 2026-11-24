import { formatSum, monthLabel, type StudentDetail } from "@onatili/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { PayDialog } from "../PayDialog";
import { Badge, ConfirmButton } from "../ui";
import { Section } from "./shared";

const date = fmtDate;

/** To'lovlar: offline oylar, online obuna, chek orqali to'lovlar (faqat egaga) */
export function StudentBilling({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const b = s.billing!;
  const [paying, setPaying] = useState(false);
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["student", s.studentId] });
    qc.invalidateQueries({ queryKey: ["roster"] });
  };
  const unmark = useMutation({
    mutationFn: (month: string) => api.unmarkOffline(s.studentId, month), // to'lovning o'z oyi: davr boshqa oydan boshlangan bo'lishi mumkin
    onSuccess: () => {
      toast("To'lov belgisi olib tashlandi");
      qc.invalidateQueries({ queryKey: ["student", s.studentId] });
      qc.invalidateQueries({ queryKey: ["roster"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Section title="To'lovlar">
      <div className="space-y-4">
        {b.offlineMonths.length > 0 && (
          <div>
            <p className="label">Oylik to'lov (offline guruh)</p>
            <div className="divide-y divide-line">
              {b.offlineMonths.map((m) => (
                // Tor telefonda summa va davr oy nomi ostiga tushadi (ustunga siqilib qolmasin)
                <div key={m.month} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                  <span className="min-w-[6.5rem] flex-1 capitalize">{monthLabel(m.month)}</span>
                  {m.paid ? (
                    <>
                      <span className="shrink-0 whitespace-nowrap">
                        <Badge tone="green">
                          {m.amountUzs ? `${formatSum(m.amountUzs)} so'm` : "to'langan"}
                          {m.note ? ` · ${m.note}` : ""}
                        </Badge>
                      </span>
                      {m.period && <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-3">{m.period}</span>}
                      <ConfirmButton label="Qaytarilsinmi?" className="btn-ghost btn-sm text-ink-3" onConfirm={() => unmark.mutate(m.paymentMonth ?? m.month)}>
                        <RotateCcw size={14} /> Qaytarish
                      </ConfirmButton>
                    </>
                  ) : (
                    <>
                      <span className="shrink-0 whitespace-nowrap">
                        <Badge tone="red">to'lanmagan</Badge>
                      </span>
                      <button className="btn-primary btn-sm" onClick={() => setPaying(true)}>
                        To'ladi
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-3">
              {b.groupFeeUzs ? `Oylik summa ${formatSum(b.groupFeeUzs)} so'm.` : "Guruhga oylik summa kiritilmagan: to'lovda summani yozasiz."} «To'ladi»da davr
              (o'quvchining o'z sanasidan) va to'lov sanasi tanlanadi.
            </p>
            {paying && <PayDialog studentId={s.studentId} onClose={() => setPaying(false)} onDone={refreshAll} />}
          </div>
        )}
        <div>
          <p className="label">Online obuna</p>
          {b.subscription ? (
            <p className="text-sm">
              <Badge tone="green">{b.subscription.planName}</Badge> {date(b.subscription.endsAt)} gacha
            </p>
          ) : (
            <p className="text-sm text-ink-3">
              Faol obuna yo'q.{" "}
              <Link to="/payments?tab=SUBS" className="font-semibold text-brand">
                Qo'lda obuna berish
              </Link>
            </p>
          )}
        </div>
        {b.payments.length > 0 && (
          <div>
            <p className="label">Chek orqali to'lovlar</p>
            <div className="divide-y divide-line">
              {b.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="w-24 shrink-0 text-ink-3">{date(p.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {p.title} · {formatSum(p.amountUzs)} so'm
                  </span>
                  <span className="shrink-0 whitespace-nowrap">
                    <Badge tone={p.status === "APPROVED" ? "green" : p.status === "PENDING" ? "amber" : "red"}>
                      {p.status === "APPROVED" ? "tasdiqlangan" : p.status === "PENDING" ? "kutilmoqda" : "rad etilgan"}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
