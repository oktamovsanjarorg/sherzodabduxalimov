import { ROLE_LABELS, type AdminGroup, type AdminUserRow } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, GraduationCap, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PayDialog } from "./PayDialog";
import { api, errMsg } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useToast } from "../lib/toast";
import { Badge, ConfirmButton, Empty, Modal, Spinner } from "./ui";

const ONLINE = "__online";
const STEPS = [
  { key: "TEACHER", label: "ustoz" },
  { key: "PARENT", label: "ota-ona" },
  { key: "PAYMENT", label: "to'lov" },
] as const;

/** To'liq ochilish qadamlari: bajarilgani yashil, kutilayotgani kulrang */
function Steps({ u }: { u: AdminUserRow }) {
  // To'lov qadami faqat egaga ko'rinadi (yordamchida paid = null)
  const steps = STEPS.filter((st) => st.key !== "PAYMENT" || u.paid !== null);
  return (
    <span className="inline-flex items-center gap-1" title="To'liq ochilish uchun: ustoz tasdig'i, ota-ona ulanishi, to'lov">
      {steps.map((st) => {
        const wait = u.waiting.includes(st.key);
        return (
          <span key={st.key} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${wait ? "bg-surface-3 text-ink-3" : "bg-emerald-50 text-emerald-700"}`}>
            {wait ? <Clock size={11} /> : <Check size={11} strokeWidth={3} />} {st.label}
          </span>
        );
      })}
    </span>
  );
}

/** O'quvchilar → Hammasi: botga kirgan har bir kishi, umumiy holati va tezkor amallar. Davomat va boshqalar guruh ichida */
export function AllUsers({ q, groups, isTeacher }: { q: string; groups: AdminGroup[]; isTeacher: boolean }) {
  const users = useQuery({ queryKey: ["users", q], queryFn: () => api.users(q), placeholderData: (p) => p });
  if (users.isPending) return <Spinner className="text-ink-4" />;
  if (!users.data?.length) return <Empty Icon={GraduationCap} title={q ? "Topilmadi" : "Hali hech kim kirmagan"} hint={q ? undefined : "Botda /start bosgan har bir kishi shu yerda ko'rinadi."} />;
  return (
    <>
      <p className="mb-2 text-xs text-ink-3">{users.data.length} ta foydalanuvchi</p>
      <div className="card divide-y divide-line">
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
  const [payOffline, setPayOffline] = useState(false);
  const del = useMutation({
    mutationFn: () => api.deleteStudent(u.studentId!, true),
    onSuccess: () => {
      toast("O'chirildi. Korzinkadan 30 kun ichida tiklash mumkin");
      refresh();
    },
    onError,
  });
  const student = u.role === "STUDENT" && !!u.studentId;
  const busy = accept.isPending;
  const contact = [u.group?.name, u.phone, u.username && `@${u.username}`, `kirgan: ${fmtDate(u.firstSeenAt)}`].filter(Boolean).join(" · ");

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
        <p className="truncate text-xs text-ink-3">{contact}</p>
        {u.children.length > 0 && <p className="truncate text-xs text-ink-3">Farzandi: {u.children.join(", ")}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {u.blocked && <Badge tone="red">bloklangan</Badge>}
        {!u.telegramLinked && <Badge tone="amber">botga kirmagan</Badge>}
        {!student ? <Badge tone="blue">{ROLE_LABELS[u.role]}</Badge> : u.full ? <Badge tone="green">to'liq ochiq</Badge> : <Steps u={u} />}
      </div>
      {student && (
        <div className="flex items-center gap-2">
          {u.waiting.includes("TEACHER") ? (
            // Tasdiqlash bitta tugma: online yoki darhol guruhga
            <select
              className="btn-primary btn-sm h-10 w-auto min-w-[160px] cursor-pointer appearance-none px-4 text-sm sm:h-9"
              aria-label="Tasdiqlash"
              disabled={busy}
              value=""
              onChange={(e) => e.target.value && accept.mutate(e.target.value === ONLINE ? null : e.target.value)}
            >
              <option value="">✓ Tasdiqlash…</option>
              <option value={ONLINE}>Online o'quvchi (guruhsiz)</option>
              {groups
                .filter((g) => g.isActive)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    Guruh: {g.name}
                  </option>
                ))}
            </select>
          ) : (
            isTeacher &&
            !u.paid && (
              <button className="btn-secondary btn-sm h-9" disabled={busy} onClick={() => (u.group ? setPayOffline(true) : setPaying(true))}>
                <Wallet size={14} /> Pul to'ladi
              </button>
            )
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
      {payOffline && u.studentId && <PayDialog studentId={u.studentId} onClose={() => setPayOffline(false)} onDone={refresh} />}
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
      <p className="mb-3 text-sm text-ink-3">O'quvchi guruhda emas, shuning uchun to'lov obuna sifatida yoziladi. Guruhda o'qisa, avval guruhga qo'shing.</p>
      {plans.isPending && <Spinner className="text-ink-4" />}
      {plans.data && !active.length && <Empty title="Faol tarif yo'q" hint="Avval Tariflar bo'limida tarif qo'shing." />}
      <div className="space-y-2">
        {active.map((p) => (
          <button key={p.id} className="btn-secondary w-full justify-between" disabled={grant.isPending} onClick={() => grant.mutate(p.id)}>
            <span>{p.name}</span>
            <span className="text-xs text-ink-3">{p.priceUzs.toLocaleString("ru-RU")} so'm</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
