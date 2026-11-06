import { ROLE_LABELS, currentMonth, type AdminGroup, type AdminUserRow } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useToast } from "../lib/toast";
import { Badge, ConfirmButton, Empty, Modal, Spinner } from "./ui";

const WAITING = { TEACHER: "ustoz", PARENT: "ota-ona", PAYMENT: "to'lov" } as const;

/** O'quvchilar → Hammasi: botga kirgan har bir kishi, umumiy holati va tezkor amallar. Davomat va boshqalar guruh ichida */
export function AllUsers({ q, groups, isTeacher }: { q: string; groups: AdminGroup[]; isTeacher: boolean }) {
  const users = useQuery({ queryKey: ["users", q], queryFn: () => api.users(q), placeholderData: (p) => p });
  if (users.isPending) return <Spinner className="text-slate-400" />;
  if (!users.data?.length) return <Empty title={q ? "Topilmadi" : "Hali hech kim kirmagan"} hint={q ? undefined : "Botda /start bosgan har bir kishi shu yerda ko'rinadi."} />;
  return (
    <>
      <p className="mb-2 text-xs text-slate-500">{users.data.length} ta foydalanuvchi</p>
      <div className="card divide-y divide-slate-100">
        {users.data.map((u) => (
          <Row key={u.userId} u={u} groups={groups} isTeacher={isTeacher} />
        ))}
      </div>
    </>
  );
}

function Row({ u, groups, isTeacher }: { u: AdminUserRow; groups: AdminGroup[]; isTeacher: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const refresh = () => {
    for (const k of ["users", "newcomers", "roster", "groups", "dashboard"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const onError = (e: unknown) => toast(errMsg(e), "error");
  const accept = useMutation({
    mutationFn: (groupId: string | null) => api.acceptStudent(u.studentId!, groupId),
    onSuccess: refresh,
    onError,
  });
  const markPaid = useMutation({
    mutationFn: () => api.markOffline({ studentId: u.studentId!, month: currentMonth() }),
    onSuccess: () => {
      toast("To'lov belgilandi");
      refresh();
    },
    onError,
  });
  const del = useMutation({
    mutationFn: () => api.deleteStudent(u.studentId!, true),
    onSuccess: () => {
      toast("O'chirildi. Korzinkadan 30 kun ichida tiklash mumkin");
      refresh();
    },
    onError,
  });
  const student = u.role === "STUDENT" && !!u.studentId;
  const busy = accept.isPending || markPaid.isPending;
  const contact = [u.phone, u.username && `@${u.username}`, `kirgan: ${fmtDate(u.firstSeenAt)}`].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        {student ? (
          <Link to={`/students/${u.studentId}`} className="block truncate font-semibold hover:underline">
            {u.name}
          </Link>
        ) : (
          <p className="truncate font-semibold">{u.name}</p>
        )}
        <p className="truncate text-xs text-slate-500">{contact}</p>
        {u.children.length > 0 && <p className="truncate text-xs text-slate-500">Farzandi: {u.children.join(", ")}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {u.blocked && <Badge tone="red">bloklangan</Badge>}
        {!u.telegramLinked && <Badge tone="amber">botga kirmagan</Badge>}
        {!student ? (
          <Badge tone="blue">{ROLE_LABELS[u.role]}</Badge>
        ) : u.full ? (
          <Badge tone="green">to'liq</Badge>
        ) : (
          <Badge tone="amber">cheklangan{u.waiting.length ? `: ${u.waiting.map((w) => WAITING[w]).join(", ")}` : ""}</Badge>
        )}
        {student && u.paid && <Badge tone="green">to'lagan</Badge>}
      </div>
      {student && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input h-9 w-auto max-w-[170px] py-0 text-sm"
            aria-label="Guruh"
            disabled={busy}
            value={u.group?.id ?? ""}
            onChange={(e) => e.target.value && accept.mutate(e.target.value)}
          >
            <option value="">Guruhga qo'shish</option>
            {groups
              .filter((g) => g.isActive || g.id === u.group?.id)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
          {u.waiting.includes("TEACHER") && (
            <button className="btn-secondary btn-sm h-9" disabled={busy} onClick={() => accept.mutate(null)}>
              <Check size={14} /> Tasdiqlash
            </button>
          )}
          {isTeacher && !u.paid && (
            <button className="btn-secondary btn-sm h-9" disabled={busy} onClick={() => (u.group ? markPaid.mutate() : setPaying(true))}>
              <Wallet size={14} /> Pul to'ladi
            </button>
          )}
        </div>
      )}
      {/* O'quvchi kartasida ism yozib o'chiriladi; ota-onada natija va to'lov yo'q */}
      {isTeacher && u.role === "PARENT" && u.studentId && (
        <ConfirmButton label="O'chirilsinmi?" onConfirm={() => del.mutate()}>
          <Trash2 size={14} />
        </ConfirmButton>
      )}
      {paying && <PlanModal u={u} onClose={() => setPaying(false)} onDone={refresh} />}
    </div>
  );
}

/** Guruhsiz o'quvchi: to'lov tarif orqali obuna sifatida yoziladi */
function PlanModal({ u, onClose, onDone }: { u: AdminUserRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const plans = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const grant = useMutation({
    mutationFn: (planId: string) => api.grantSubscription({ userId: u.userId, planId, note: "Pul to'ladi deb belgilandi" }),
    onSuccess: () => {
      toast("Obuna berildi");
      onDone();
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const active = plans.data?.filter((p) => p.isActive) ?? [];
  return (
    <Modal title={`${u.name}: tarifni tanlang`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">O'quvchi guruhda emas, shuning uchun to'lov obuna sifatida yoziladi. Guruhda o'qisa, avval guruhga qo'shing.</p>
      {plans.isPending && <Spinner className="text-slate-400" />}
      {plans.data && !active.length && <Empty title="Faol tarif yo'q" hint="Avval Tariflar bo'limida tarif qo'shing." />}
      <div className="space-y-2">
        {active.map((p) => (
          <button key={p.id} className="btn-secondary w-full justify-between" disabled={grant.isPending} onClick={() => grant.mutate(p.id)}>
            <span>{p.name}</span>
            <span className="text-xs text-slate-500">{p.priceUzs.toLocaleString("ru-RU")} so'm</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
