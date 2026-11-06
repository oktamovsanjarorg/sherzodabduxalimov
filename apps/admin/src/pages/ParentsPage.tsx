import { PARENT_FLAG_LABELS, type AdminParentLink } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Phone, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Badge, ConfirmButton, Empty, Modal, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtShortDateTime } from "../lib/format";
import { useToast } from "../lib/toast";

type Tab = "PENDING" | "APPROVED" | "REJECTED";
const REASONS = ["Raqam o'quvchining o'ziniki", "Qo'ng'iroqqa javob bermadi", "Bu odam ota-onasi emas", "O'quvchining boshqa akkaunti"];

export function ParentsPage() {
  const [tab, setTab] = useState<Tab>("PENDING");
  const links = useQuery({ queryKey: ["parent-links", tab], queryFn: () => api.parentLinks(tab), refetchInterval: tab === "PENDING" ? 15_000 : false });
  const pending = useQuery({ queryKey: ["parent-links", "PENDING"], queryFn: () => api.parentLinks("PENDING"), enabled: tab !== "PENDING" });
  const pendingCount = (tab === "PENDING" ? links.data : pending.data)?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Ota-onalar"
        subtitle="O'quvchi yuborgan havola orqali ota-ona botda o'z raqamini ulashadi. Raqamga qo'ng'iroq qilib, haqiqatan ota-onasi ekanini tekshiring."
      />
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {(
          [
            ["PENDING", `Kutilmoqda${pendingCount ? ` (${pendingCount})` : ""}`],
            ["APPROVED", "Tasdiqlangan"],
            ["REJECTED", "Rad etilgan"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-brand text-white" : "text-slate-600"}`}>
            {l}
          </button>
        ))}
      </div>
      {links.isPending && <Spinner className="text-slate-400" />}
      {links.data?.length === 0 && (
        <Empty title={tab === "PENDING" ? "Tekshiriladigan so'rov yo'q" : "Ro'yxat bo'sh"} hint={tab === "PENDING" ? "Yangi so'rovlar shu yerda paydo bo'ladi." : undefined} />
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {links.data?.map((l) => <LinkCard key={l.id} link={l} />)}
      </div>
    </>
  );
}

function Person({ label, name, username, phone }: { label: string; name: string; username: string | null; phone: string | null }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate font-bold">{name}</p>
      <p className="truncate text-xs text-slate-500">{username ? `@${username}` : "username yo'q"}</p>
      {phone ? (
        <a href={`tel:${phone}`} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand">
          <Phone size={14} /> {phone}
        </a>
      ) : (
        <p className="mt-1 text-xs text-slate-400">Raqam yo'q</p>
      )}
    </div>
  );
}

function LinkCard({ link }: { link: AdminParentLink }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const done = () => qc.invalidateQueries({ queryKey: ["parent-links"] });
  const remove = useMutation({
    mutationFn: () => api.deleteParentLink(link.id),
    onSuccess: () => {
      toast("O'chirildi");
      done();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const approve = useMutation({
    mutationFn: () => api.approveParent(link.id),
    onSuccess: () => {
      toast("Tasdiqlandi. Ota-onaga xabar yuborildi");
      done();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <div className={`card p-4 ${link.flags.length && link.status === "PENDING" ? "border-red-300" : ""}`}>
      <div className="flex flex-wrap gap-4">
        <Person label="O'quvchi" name={link.student.name} username={link.student.username} phone={link.student.phone} />
        <Person label={`Ota-ona${link.relation ? ` (${link.relation})` : ""}`} name={link.parent.name} username={link.parent.username} phone={link.phone} />
      </div>
      {link.student.groupName && <p className="mt-2 text-xs text-slate-500">Guruh: {link.student.groupName}</p>}

      {link.flags.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {link.flags.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {PARENT_FLAG_LABELS[f] ?? f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">{fmtShortDateTime(link.createdAt)}</span>
        <span className="flex-1" />
        {link.status === "PENDING" ? (
          <div className="flex w-full gap-2 sm:w-auto">
            <button className="btn-danger flex-1 sm:flex-none" onClick={() => setRejecting(true)}>
              <X size={16} /> Rad etish
            </button>
            <button className="btn-primary flex-1 sm:flex-none" onClick={() => approve.mutate()} disabled={approve.isPending}>
              <Check size={16} /> Tasdiqlash
            </button>
          </div>
        ) : link.status === "APPROVED" ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Badge tone="green">
              <ShieldCheck size={11} /> {link.reviewedBy ?? ""} tasdiqlagan
            </Badge>
            <button className="btn-danger btn-sm" onClick={() => setRejecting(true)}>
              Bekor qilish
            </button>
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Badge tone="red">Rad etilgan: {link.rejectReason}</Badge>
            <button className="btn-secondary btn-sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
              <Check size={14} /> Qayta tasdiqlash
            </button>
            <ConfirmButton label="Ulanish o'chirilsinmi?" onConfirm={() => remove.mutate()}>
              O'chirish
            </ConfirmButton>
          </div>
        )}
      </div>
      {rejecting && <RejectModal link={link} onClose={() => setRejecting(false)} onDone={done} />}
    </div>
  );
}

function RejectModal({ link, onClose, onDone }: { link: AdminParentLink; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const reject = useMutation({
    mutationFn: () => api.rejectParent(link.id, reason),
    onSuccess: () => {
      toast("Rad etildi. O'quvchiga sabab yuborildi");
      onDone();
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title={link.status === "APPROVED" ? "Tasdiqni bekor qilish" : "So'rovni rad etish"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()}>
            Rad etish
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        <b>{link.parent.name}</b> → <b>{link.student.name}</b>. Sabab o'quvchiga yuboriladi.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button key={r} className={`btn-sm btn border ${reason === r ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`} onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <textarea className="textarea min-h-[70px]" placeholder="Yoki o'z sababingizni yozing" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
