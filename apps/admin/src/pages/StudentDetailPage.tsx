import { ATTENDANCE_LABELS, ESSAY_STATUS_LABELS, formatSum, monthLabel, type AttendanceStatusName, type EssayStatusName, type StudentDetail, formatScore } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, ClipboardCheck, Copy, GraduationCap, Pencil, Phone, RotateCcw, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, ConfirmButton, Field, Modal, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtDate } from "../lib/format";
import { loadSession } from "../lib/session";
import { useToast } from "../lib/toast";

const date = fmtDate;
const ATT_TONE: Record<AttendanceStatusName, "green" | "amber" | "red" | "blue"> = { PRESENT: "green", LATE: "amber", ABSENT: "red", EXCUSED: "blue" };

export function StudentDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["student", id], queryFn: () => api.student(id) });
  if (q.isPending) return <Spinner className="text-slate-400" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  const s = q.data;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to={s.group ? `/students?group=${s.group.id}` : "/students"} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> O'quvchilar
      </Link>
      <Header s={s} />
      {!s.telegramLinked && <ConnectCard s={s} />}
      <Manage s={s} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Ota-onalar">
          <Parents s={s} />
        </Section>
        <Section title="Davomat">
          <Attendance s={s} />
        </Section>
        {s.billing && (
          <Section title="To'lovlar">
            <Billing s={s} />
          </Section>
        )}
        <Section title="O'qish natijalari">
          <Stats s={s} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly className="input h-9 min-w-0 flex-1 bg-white text-xs" value={value} onFocus={(e) => e.target.select()} />
      <button
        className="btn-primary btn-sm shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Nusxalandi" : "Nusxalash"}
      </button>
    </div>
  );
}

function Header({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.groups });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["student", s.studentId] });
    qc.invalidateQueries({ queryKey: ["roster"] });
    qc.invalidateQueries({ queryKey: ["groups"] });
  };
  const move = useMutation({
    mutationFn: (groupId: string) => api.updateStudent(s.studentId, { groupId: groupId || null }),
    onSuccess: () => {
      toast("Guruh o'zgartirildi");
      refresh();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <div className="card flex flex-wrap items-start gap-4 p-4 sm:p-5">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">{s.name[0]}</span>
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-xl font-extrabold">{s.name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          {s.phone ? (
            <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand">
              <Phone size={14} /> {s.phone}
            </a>
          ) : (
            <span>telefon yo'q</span>
          )}
          {s.username && <span>@{s.username}</span>}
          {s.telegramLinked ? <Badge tone="green">botda</Badge> : <Badge tone="amber">botga kirmagan</Badge>}
          {s.blocked && <Badge tone="red">bloklangan</Badge>}
          {s.accessMode === "FREE" && <Badge tone="blue">bepul ochiq</Badge>}
          {s.accessMode === "CLOSED" && <Badge tone="red">kirish yopiq</Badge>}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="input h-9 w-auto min-w-[200px] text-sm" value={s.group?.id ?? ""} disabled={move.isPending} onChange={(e) => move.mutate(e.target.value)}>
            <option value="">Guruhsiz (online)</option>
            {groups.data
              ?.filter((g) => g.isActive || g.id === s.group?.id)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
          <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Tahrirlash
          </button>

        </div>
      </div>
      {editing && <EditModal s={s} onClose={() => setEditing(false)} onDone={refresh} />}
    </div>
  );
}

function ConnectCard({ s }: { s: StudentDetail }) {
  const qc = useQueryClient();
  const reset = useMutation({ mutationFn: () => api.resetStudentInvite(s.studentId), onSuccess: () => qc.invalidateQueries({ queryKey: ["student", s.studentId] }) });
  return (
    <div className="card border-amber-300 bg-amber-50/60 p-4 sm:p-5">
      <p className="font-bold">O'quvchi hali botga kirmagan</p>
      <p className="mt-1 text-sm text-slate-600">
        Davomat va to'lovlarni hozirdan belgilayverishingiz mumkin. Ilovadan foydalanishi uchun u botga kirib <b>telefon raqamini ulashsa</b> ({s.phone ?? "raqam kiritilmagan"}) yoki quyidagi{" "}
        <b>shaxsiy havolani</b> bossa, hisobi shu yozuvga avtomatik bog'lanadi.
      </p>
      {s.inviteUrl ? (
        <div className="mt-3">
          <CopyField value={s.inviteUrl} />
        </div>
      ) : (
        <button className="btn-secondary btn-sm mt-3" onClick={() => reset.mutate()}>
          Shaxsiy havola yaratish
        </button>
      )}
    </div>
  );
}

function EditModal({ s, onClose, onDone }: { s: StudentDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [first, ...rest] = s.name.split(" ");
  const [d, setD] = useState({ firstName: first, lastName: rest.join(" "), phone: s.phone ?? "" });
  const save = useMutation({
    mutationFn: () => api.updateStudent(s.studentId, { firstName: d.firstName.trim(), lastName: d.lastName.trim() || null, phone: d.phone.trim() || null }),
    onSuccess: () => {
      toast("Saqlandi");
      onDone();
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title="O'quvchini tahrirlash"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn-primary" disabled={d.firstName.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ism">
            <input className="input" value={d.firstName} onChange={(e) => setD({ ...d, firstName: e.target.value })} />
          </Field>
          <Field label="Familiya">
            <input className="input" value={d.lastName} onChange={(e) => setD({ ...d, lastName: e.target.value })} />
          </Field>
        </div>
        <Field label="Telefon">
          <input className="input" inputMode="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function Parents({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["student", s.studentId] });
    qc.invalidateQueries({ queryKey: ["roster"] });
    qc.invalidateQueries({ queryKey: ["parent-links"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
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
    <div className="space-y-3">
      {s.parentList.length === 0 && <p className="text-sm text-slate-500">Ota-ona ulanmagan.</p>}
      {s.parentList.map((p) => (
        <div key={p.id} className="rounded-lg border border-slate-100 p-2.5 text-sm">
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
              <input className="input h-9 flex-1 text-sm" autoFocus placeholder="Sabab (o'quvchiga boradi)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn-danger btn-sm" disabled={reason.trim().length < 3 || act.isPending} onClick={() => act.mutate({ kind: "reject", id: p.id, reason: reason.trim() })}>
                Saqlash
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setRejecting(null)}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
      <div>
        <p className="mb-1 text-xs text-slate-500">Ota-onaga yuboring: bosib, botda raqamini ulashadi (keyin shu yerda yoki O'quvchilar sahifasidagi «Ko'rib chiqish kerak» blokida tasdiqlaysiz)</p>
        <CopyField value={s.parentInviteUrl} />
      </div>
    </div>
  );
}

/** Ilovaga kirish, bloklash, o'chirish. Kirish va bloklash faqat egaga */
function Manage({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isTeacher = loadSession()?.user.role === "TEACHER";
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const refresh = (d?: StudentDetail) => {
    if (d) qc.setQueryData(["student", s.studentId], d);
    qc.invalidateQueries({ queryKey: ["roster"] });
  };
  const access = useMutation({
    mutationFn: (mode: "AUTO" | "FREE" | "CLOSED") => api.setStudentAccess(s.studentId, mode),
    onSuccess: (d) => {
      toast("Saqlandi");
      refresh(d);
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const block = useMutation({
    mutationFn: (blocked: boolean) => api.blockStudent(s.studentId, blocked, reason.trim() || null),
    onSuccess: (d) => {
      toast(d.blocked ? "Bloklandi" : "Blokdan chiqarildi");
      setReason("");
      refresh(d);
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const del = useMutation({
    mutationFn: () => api.deleteStudent(s.studentId, true), // ism yozib tasdiqlangan
    onSuccess: () => {
      toast("O'quvchi o'chirildi. Korzinkadan 30 kun ichida tiklash mumkin");
      qc.invalidateQueries({ queryKey: ["roster"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      navigate("/students", { replace: true });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const modes = [
    ["AUTO", "Avtomatik", "Obuna yoki offline guruh bo'yicha"],
    ["FREE", "Bepul ochiq", "To'lovsiz hamma narsa ochiq"],
    ["CLOSED", "Yopiq", "Pullik kontent yopiq (obuna/guruh bo'lsa ham)"],
  ] as const;
  const canDelete = !s.telegramLinked || isTeacher;

  return (
    <Section title="Boshqaruv">
      <div className="grid gap-4 lg:grid-cols-3">
        {isTeacher && (
          <div>
            <p className="label">Ilovaga kirish</p>
            <div className="space-y-1.5">
              {modes.map(([m, label, hint]) => (
                <button
                  key={m}
                  disabled={access.isPending}
                  onClick={() => m !== s.accessMode && access.mutate(m)}
                  className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm ${s.accessMode === m ? "border-brand bg-brand-soft" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${s.accessMode === m ? "border-brand bg-brand" : "border-slate-300"}`} />
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-xs text-slate-500">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Hozir: {s.hasAccess ? <b className="text-emerald-700">darslar ochiq</b> : <b className="text-red-600">darslar yopiq</b>}</p>
          </div>
        )}
        {isTeacher && (
          <div>
            <p className="label">Bloklash</p>
            {s.blocked ? (
              <>
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  Bloklangan{s.blockedReason ? `: ${s.blockedReason}` : ""}. Ilovani ocha olmaydi.
                </p>
                <button className="btn-secondary btn-sm mt-2" disabled={block.isPending} onClick={() => block.mutate(false)}>
                  Blokdan chiqarish
                </button>
              </>
            ) : (
              <>
                <input className="input h-9 text-sm" placeholder="Sabab (ixtiyoriy, o'quvchiga ko'rinadi)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn-danger btn-sm mt-2" disabled={block.isPending} onClick={() => block.mutate(true)}>
                  Bloklash
                </button>
                <p className="mt-1 text-xs text-slate-500">Bloklangan o'quvchi ilovani umuman ocha olmaydi. Ma'lumotlari saqlanadi.</p>
              </>
            )}
          </div>
        )}
        <div>
          <p className="label">O'chirish</p>
          {!canDelete ? (
            <p className="text-sm text-slate-500">Botdan foydalanayotgan o'quvchini faqat ustoz o'chira oladi. Guruhdan chiqarish uchun yuqoridagi guruh tanlovidan foydalaning.</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Barcha natijalari, davomati va to'lovlari bilan korzinkaga o'tadi: 30 kun ichida Ko'proq → Korzinka'dan to'liq tiklash mumkin.
                {s.telegramLinked && " Vaqtincha to'xtatish uchun bloklash yaxshiroq."}
              </p>
              <input className="input mt-2 h-9 text-sm" placeholder={`Tasdiqlash uchun "${s.name.split(" ")[0]}" deb yozing`} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
              <button className="btn-danger btn-sm mt-2" disabled={confirmDelete.trim().toLowerCase() !== s.name.split(" ")[0].toLowerCase() || del.isPending} onClick={() => del.mutate()}>
                <Trash2 size={13} /> O'chirish
              </button>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

function Attendance({ s }: { s: StudentDetail }) {
  const c = s.attendance.counts;
  const total = c.PRESENT + c.LATE + c.ABSENT + c.EXCUSED;
  if (!total) return <p className="text-sm text-slate-500">Hali davomat belgilanmagan.</p>;
  return (
    <>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((k) => (
          <div key={k} className="rounded-lg bg-slate-50 py-2">
            <p className="text-lg font-extrabold">{c[k]}</p>
            <p className="text-[11px] text-slate-500">{ATTENDANCE_LABELS[k]}</p>
          </div>
        ))}
      </div>
      <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
        {s.attendance.recent.map((a) => (
          <div key={a.date} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="w-24 shrink-0 text-slate-500">{fmtDate(a.date)}</span>
            <Badge tone={ATT_TONE[a.status]}>{ATTENDANCE_LABELS[a.status]}</Badge>
            {a.note && <span className="truncate text-xs text-slate-500">{a.note}</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function Billing({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const b = s.billing!;
  const [askMonth, setAskMonth] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const mark = useMutation({
    mutationFn: (month: string) =>
      api.markOffline({ studentId: s.studentId, month, note: "Naqd", ...(b.groupFeeUzs ? {} : { amountUzs: Number(amount.replace(/\D/g, "")) }) }),
    onSuccess: () => {
      setAskMonth(null);
      setAmount("");
      toast("To'lov belgilandi");
      qc.invalidateQueries({ queryKey: ["student", s.studentId] });
      qc.invalidateQueries({ queryKey: ["roster"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const unmark = useMutation({
    mutationFn: (month: string) => api.unmarkOffline(s.studentId, month),
    onSuccess: () => {
      toast("To'lov belgisi olib tashlandi");
      qc.invalidateQueries({ queryKey: ["student", s.studentId] });
      qc.invalidateQueries({ queryKey: ["roster"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <div className="space-y-4">
      {b.offlineMonths.length > 0 && (
        <div>
          <p className="label">Oylik to'lov (offline guruh)</p>
          <div className="divide-y divide-slate-100">
            {b.offlineMonths.map((m) => (
              <div key={m.month} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="flex-1 capitalize">{monthLabel(m.month)}</span>
                {m.paid ? (
                  <>
                    <Badge tone="green">
                      {m.amountUzs ? `${formatSum(m.amountUzs)} so'm` : "to'langan"}
                      {m.note ? ` · ${m.note}` : ""}
                    </Badge>
                    <ConfirmButton label="Qaytarilsinmi?" className="btn-ghost btn-sm text-slate-500" onConfirm={() => unmark.mutate(m.month)}>
                      <RotateCcw size={14} /> Qaytarish
                    </ConfirmButton>
                  </>
                ) : (
                  <>
                    <Badge tone="red">to'lanmagan</Badge>
                    {askMonth === m.month ? (
                      <span className="flex items-center gap-1">
                        <input className="input h-8 w-28 text-sm" inputMode="numeric" placeholder="Summa" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
                        <button className="btn-primary btn-sm" disabled={mark.isPending || !Number(amount.replace(/\D/g, ""))} onClick={() => mark.mutate(m.month)}>
                          Saqlash
                        </button>
                      </span>
                    ) : (
                      <button className="btn-primary btn-sm" disabled={mark.isPending} onClick={() => (b.groupFeeUzs ? mark.mutate(m.month) : setAskMonth(m.month))}>
                        To'ladi
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {b.groupFeeUzs ? `Summa guruhning oylik summasidan olinadi (${formatSum(b.groupFeeUzs)} so'm).` : "Guruhga oylik summa kiritilmagan: to'lovda summani yozasiz."} Boshqa summa uchun: To'lovlar → Offline guruhlar.
          </p>
        </div>
      )}
      <div>
        <p className="label">Online obuna</p>
        {b.subscription ? (
          <p className="text-sm">
            <Badge tone="green">{b.subscription.planName}</Badge> {date(b.subscription.endsAt)} gacha
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            Faol obuna yo'q. <Link to="/payments?tab=SUBS" className="font-semibold text-brand">Qo'lda obuna berish</Link>
          </p>
        )}
      </div>
      {b.payments.length > 0 && (
        <div>
          <p className="label">Chek orqali to'lovlar</p>
          <div className="divide-y divide-slate-100">
            {b.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-24 shrink-0 text-slate-500">{date(p.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {p.title} · {formatSum(p.amountUzs)} so'm
                </span>
                <Badge tone={p.status === "APPROVED" ? "green" : p.status === "PENDING" ? "amber" : "red"}>
                  {p.status === "APPROVED" ? "tasdiqlangan" : p.status === "PENDING" ? "kutilmoqda" : "rad etilgan"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stats({ s }: { s: StudentDetail }) {
  const st = s.stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-lg font-extrabold">{st.lessonsCompleted}</p>
          <p className="text-[11px] text-slate-500">dars ko'rgan</p>
        </div>
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-lg font-extrabold">{st.testsTaken}</p>
          <p className="text-[11px] text-slate-500">test ishlagan</p>
        </div>
        <div className="rounded-lg bg-slate-50 py-2">
          <p className="text-lg font-extrabold">{st.averagePercent !== null ? `${st.averagePercent}%` : "—"}</p>
          <p className="text-[11px] text-slate-500">o'rtacha natija</p>
        </div>
      </div>
      {st.recentAttempts.length > 0 && (
        <div>
          <p className="label">Oxirgi testlar</p>
          <div className="divide-y divide-slate-100">
            {st.recentAttempts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-24 shrink-0 text-slate-500">{date(a.finishedAt)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                  {a.type === "MOCK" && <ClipboardCheck size={14} className="shrink-0 text-slate-400" aria-label="Mock" />}
                  <span className="truncate">{a.title}</span>
                </span>
                <Badge tone={a.percent >= 80 ? "green" : a.percent >= 50 ? "brand" : "red"}>{a.percent}%</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      {st.essays.length > 0 && (
        <div>
          <p className="label">Esselar</p>
          <div className="divide-y divide-slate-100">
            {st.essays.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-24 shrink-0 text-slate-500">{date(e.createdAt)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                  {e.mode === "AI" ? <Bot size={14} className="shrink-0 text-slate-400" aria-label="AI" /> : <GraduationCap size={14} className="shrink-0 text-slate-400" aria-label="Ustoz" />}
                  <span className="truncate">{e.prompt}</span>
                </span>
                {e.score !== null ? <Badge tone="green">{formatScore(e.score)}/24</Badge> : <Badge>{ESSAY_STATUS_LABELS[e.status as EssayStatusName] ?? e.status}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!st.testsTaken && !st.lessonsCompleted && !st.essays.length && <p className="text-sm text-slate-500">Hali ilovadan foydalanmagan.</p>}
    </div>
  );
}
