import type { StudentDetail } from "@onatili/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";
import { api, errMsg } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { Badge, ConfirmButton } from "../ui";
import { CopyField, Section } from "./shared";

/** Ota-onalar: tasdiqlash/rad etish va ulash havolasi */
export function StudentParents({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => {
    for (const k of ["student", "roster", "parent-links", "dashboard"]) qc.invalidateQueries({ queryKey: k === "student" ? [k, s.studentId] : [k] });
  };
  const act = useMutation({
    mutationFn: (a: { kind: "approve" | "reject" | "delete"; id: string; reason?: string }) =>
      a.kind === "approve" ? api.approveParent(a.id) : a.kind === "reject" ? api.rejectParent(a.id, a.reason ?? "") : api.deleteParentLink(a.id),
    onSuccess: (_r, a) => {
      toast(a.kind === "approve" ? "Tasdiqlandi" : a.kind === "reject" ? "Bekor qilindi" : "O'chirildi");
      setRejecting(null);
      setReason("");
      refresh();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <div className="space-y-4">
      <Section title="Ulangan ota-onalar">
        <div className="space-y-2">
          {s.parentList.length === 0 && <p className="text-sm text-ink-3">Hali hech kim ulanmagan. Pastdagi havolani ota-onaga yuboring.</p>}
          {s.parentList.map((p) => (
            <div key={p.id} className={`rounded-xl border p-3 text-sm ${p.status === "PENDING" ? "border-sky-300 bg-sky-50/50" : "border-line"}`}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {p.name}
                    {p.relation ? ` (${p.relation})` : ""}
                  </p>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="text-xs font-semibold text-brand">
                      {p.phone}
                    </a>
                  )}
                </div>
                {p.status === "APPROVED" ? <Badge tone="green">tasdiqlangan</Badge> : p.status === "PENDING" ? <Badge tone="blue">kutilmoqda</Badge> : <Badge tone="red">rad etilgan</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.status !== "APPROVED" && (
                  <button className="btn-primary btn-sm" disabled={act.isPending} onClick={() => act.mutate({ kind: "approve", id: p.id })}>
                    <Check size={13} /> {p.status === "REJECTED" ? "Qayta tasdiqlash" : "Tasdiqlash"}
                  </button>
                )}
                {p.status !== "REJECTED" && (
                  <button className="btn-danger btn-sm" onClick={() => setRejecting(p.id)}>
                    {p.status === "APPROVED" ? "Tasdiqni bekor qilish" : "Rad etish"}
                  </button>
                )}
                <ConfirmButton label="Ulanish o'chirilsinmi?" onConfirm={() => act.mutate({ kind: "delete", id: p.id })}>
                  <Trash2 size={13} />
                </ConfirmButton>
              </div>
              {rejecting === p.id && (
                <div className="mt-2 flex gap-2">
                  <input className="input h-10 flex-1 text-sm sm:h-9" autoFocus placeholder="Sabab (o'quvchiga boradi)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn-danger btn-sm" disabled={reason.trim().length < 3 || act.isPending} onClick={() => act.mutate({ kind: "reject", id: p.id, reason: reason.trim() })}>
                    Saqlash
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setRejecting(null)} aria-label="Bekor qilish">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Ota-onani ulash havolasi" hint="Ota-onaga yuboring: bosib, botda raqamini ulashadi. Keyin shu yerda tasdiqlaysiz.">
        <CopyField value={s.parentInviteUrl} />
      </Section>
    </div>
  );
}
