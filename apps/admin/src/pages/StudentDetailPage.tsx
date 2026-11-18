import { ATTENDANCE_LABELS, ESSAY_STATUS_LABELS, formatSum, monthLabel, type AttendanceStatusName, type EssayStatusName, type StudentDetail, formatScore } from "@onatili/shared";
import { StudentAdvisor } from "../components/StudentAdvisor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, ClipboardCheck, Copy, GraduationCap, Pencil, Phone, RotateCcw, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PayDialog } from "../components/PayDialog";
import { Badge, ConfirmButton, Field, Modal, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtDate, fmtDateTime } from "../lib/format";
import { loadSession } from "../lib/session";
import { useToast } from "../lib/toast";

const date = fmtDate;
const ATT_TONE: Record<AttendanceStatusName, "green" | "amber" | "red" | "blue"> = { PRESENT: "green", LATE: "amber", ABSENT: "red", EXCUSED: "blue" };

export function StudentDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["student", id], queryFn: () => api.student(id) });
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  const s = q.data;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to={s.group ? `/students?group=${s.group.id}` : "/students"} className="tap inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> O'quvchilar
      </Link>
      <Header s={s} />
      {!s.telegramLinked && <ConnectCard s={s} />}
      <Section title="Yo'nalish va tavsiyalar">
        <StudentAdvisor id={s.studentId} />
      </Section>
      <Manage s={s} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
        <Section title="Test natijalari">
          <ExternalResults s={s} />
        </Section>
        <Section title="Faollik: bot va darslar">
          <Activity s={s} />
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
      <input readOnly className="input h-9 min-w-0 flex-1 bg-surface text-xs" value={value} onFocus={(e) => e.target.select()} />
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
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
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
      </div>
      {/* Telefonda boshqaruvlar ism ostida to'liq kenglikda: sana maydoni ekrandan chiqib ketmasin */}
      <div className="flex w-full flex-wrap items-center gap-2 sm:pl-[4.5rem]">
          <select className="input h-10 w-full min-w-0 text-sm sm:h-9 sm:w-auto sm:min-w-[200px]" value={s.group?.id ?? ""} disabled={move.isPending} onChange={(e) => move.mutate(e.target.value)}>
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
          <StartedOn s={s} onDone={refresh} />
      </div>
      {editing && <EditModal s={s} onClose={() => setEditing(false)} onDone={refresh} />}
    </div>
  );
}

/** O'qishni boshlagan sana: birinchi to'lov davri shundan boshlanadi */
function StartedOn({ s, onDone }: { s: StudentDetail; onDone: () => void }) {
  const toast = useToast();
  const save = useMutation({
    mutationFn: (v: string) => api.updateStudent(s.studentId, { startedOn: v || null }),
    onSuccess: () => {
      toast("O'qishni boshlagan sana saqlandi");
      onDone();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
      O'qishni boshlagan:
      <input
        type="date"
        className={`input h-10 w-auto min-w-0 text-sm sm:h-9 ${s.startedOn ? "" : "border-amber-400"}`}
        value={s.startedOn ?? ""}
        disabled={save.isPending}
        onChange={(e) => save.mutate(e.target.value)}
        title="Birinchi to'lov davri shu sanadan boshlanadi"
      />
      {!s.startedOn && <span className="text-xs font-semibold text-amber-800">kiritilmagan</span>}
    </label>
  );
}

function ConnectCard({ s }: { s: StudentDetail }) {
  const qc = useQueryClient();
  const reset = useMutation({ mutationFn: () => api.resetStudentInvite(s.studentId), onSuccess: () => qc.invalidateQueries({ queryKey: ["student", s.studentId] }) });
  return (
    <div className="card border-amber-300 bg-amber-50 p-4 sm:p-5">
      <p className="font-bold">O'quvchi hali botga kirmagan</p>
      <p className="mt-1 text-sm text-ink-2">
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
      {s.parentList.length === 0 && <p className="text-sm text-ink-3">Ota-ona ulanmagan.</p>}
      {s.parentList.map((p) => (
        <div key={p.id} className="rounded-lg border border-line p-2.5 text-sm">
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
        <p className="mb-1 text-xs text-ink-3">Ota-onaga yuboring: bosib, botda raqamini ulashadi (keyin shu yerda yoki O'quvchilar sahifasidagi «Ko'rib chiqish kerak» blokida tasdiqlaysiz)</p>
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
    ["FREE", "Bepul ochiq", "To'lovsiz va tasdiqsiz hamma narsa ochiq"],
    ["CLOSED", "Yopiq", "Pullik kontent yopiq (obuna/guruh bo'lsa ham)"],
  ] as const;
  const canDelete = !s.telegramLinked || isTeacher;

  return (
    <Section title="Boshqaruv">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {isTeacher && (
          <div>
            <p className="label">Ilovaga kirish</p>
            <div className="space-y-1.5">
              {modes.map(([m, label, hint]) => (
                <button
                  key={m}
                  disabled={access.isPending}
                  onClick={() => m !== s.accessMode && access.mutate(m)}
                  className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm ${s.accessMode === m ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}
                >
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${s.accessMode === m ? "border-brand bg-brand" : "border-line-strong"}`} />
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-xs text-ink-3">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">Hozir: {s.hasAccess ? <b className="text-emerald-700">darslar ochiq</b> : <b className="text-red-600">darslar yopiq</b>}</p>
          </div>
        )}
        {isTeacher && (
          <div>
            <p className="label">Bloklash</p>
            {s.blocked ? (
              <>
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
                <p className="mt-1 text-xs text-ink-3">Bloklangan o'quvchi ilovani umuman ocha olmaydi. Ma'lumotlari saqlanadi.</p>
              </>
            )}
          </div>
        )}
        <div>
          <p className="label">O'chirish</p>
          {!canDelete ? (
            <p className="text-sm text-ink-3">Botdan foydalanayotgan o'quvchini faqat ustoz o'chira oladi. Guruhdan chiqarish uchun yuqoridagi guruh tanlovidan foydalaning.</p>
          ) : (
            <>
              <p className="text-xs text-ink-3">
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
  if (!total) return <p className="text-sm text-ink-3">Hali davomat belgilanmagan.</p>;
  return (
    <>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((k) => (
          <div key={k} className="rounded-lg bg-surface-2 py-2">
            <p className="text-lg font-extrabold">{c[k]}</p>
            <p className="text-[11px] text-ink-3">{ATTENDANCE_LABELS[k]}</p>
          </div>
        ))}
      </div>
      <div className="max-h-56 divide-y divide-line overflow-y-auto">
        {s.attendance.recent.map((a) => (
          <div key={a.date} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="w-24 shrink-0 text-ink-3">{fmtDate(a.date)}</span>
            <Badge tone={ATT_TONE[a.status]}>{ATTENDANCE_LABELS[a.status]}</Badge>
            {a.grade && <span className="text-xs font-extrabold text-ink-2">{a.grade}/5</span>}
            {a.note && <span className="truncate text-xs text-ink-3">{a.note}</span>}
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
    <div className="space-y-4">
      {b.offlineMonths.length > 0 && (
        <div>
          <p className="label">Oylik to'lov (offline guruh)</p>
          <div className="divide-y divide-line">
            {b.offlineMonths.map((m) => (
              <div key={m.month} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="flex-1 capitalize">{monthLabel(m.month)}</span>
                {m.paid ? (
                  <>
                    <Badge tone="green">
                      {m.amountUzs ? `${formatSum(m.amountUzs)} so'm` : "to'langan"}
                      {m.note ? ` · ${m.note}` : ""}
                    </Badge>
                    {m.period && <span className="text-[11px] text-ink-3">{m.period}</span>}
                    <ConfirmButton label="Qaytarilsinmi?" className="btn-ghost btn-sm text-ink-3" onConfirm={() => unmark.mutate(m.paymentMonth ?? m.month)}>
                      <RotateCcw size={14} /> Qaytarish
                    </ConfirmButton>
                  </>
                ) : (
                  <>
                    <Badge tone="red">to'lanmagan</Badge>
                    <button className="btn-primary btn-sm" onClick={() => setPaying(true)}>
                      To'ladi
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {b.groupFeeUzs ? `Oylik summa ${formatSum(b.groupFeeUzs)} so'm.` : "Guruhga oylik summa kiritilmagan: to'lovda summani yozasiz."} «To'ladi»da davr (o'quvchining o'z sanasidan) va to'lov sanasi tanlanadi.
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
            Faol obuna yo'q. <Link to="/payments?tab=SUBS" className="font-semibold text-brand">Qo'lda obuna berish</Link>
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

function ExternalResults({ s }: { s: StudentDetail }) {
  const r = s.externalResults;
  if (!r.length) return <p className="text-sm text-ink-4">Import qilingan natija yo'q</p>;
  // Eskidan yangiga: o'sish chizig'i
  const trend = [...r].reverse();
  return (
    <div className="space-y-3">
      <div className="flex h-16 items-end gap-1" title="Foiz, eskidan yangiga">
        {trend.map((x) => (
          <div key={x.id} className={`flex-1 rounded-t ${x.percent >= 60 ? "bg-brand" : "bg-amber-400"}`} style={{ height: `${Math.max(4, x.percent)}%` }} title={`${x.title}: ${x.percent}%`} />
        ))}
      </div>
      <ul className="divide-y divide-line">
        {r.map((x) => (
          <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{x.title}</p>
              <p className="text-xs text-ink-3">
                {x.takenAt ? date(x.takenAt) : ""} · {x.correct}/{x.questionCount} to'g'ri · {x.rank}-o'rin / {x.participants}
              </p>
            </div>
            <Badge tone={x.percent >= 80 ? "green" : x.percent >= 60 ? "blue" : x.percent >= 40 ? "amber" : "red"}>{formatScore(x.percent)}%</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Activity({ s }: { s: StudentDetail }) {
  const a = s.activity;
  const row = (label: string, v: string | null, empty: string) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-3">{label}</span>
      {v ? <b>{fmtDateTime(v)}</b> : <span className="text-ink-4">{empty}</span>}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="divide-y divide-line">
        {row("Botga ulangan", a.botJoinedAt, s.telegramLinked ? "noma'lum" : "hali kirmagan")}
        {row("Botga oxirgi kirgan", a.lastBotAt, "ma'lumot yo'q")}
        {row("Ilovani oxirgi ochgan", a.lastAppAt, "ma'lumot yo'q")}
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Oxirgi ochilgan darslar</p>
        {a.lessons.length === 0 ? (
          <p className="text-sm text-ink-4">Hali dars ochmagan</p>
        ) : (
          <ul className="divide-y divide-line">
            {a.lessons.map((l) => (
              <li key={l.lessonId} className="flex items-start gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.title}</p>
                  <p className="truncate text-xs text-ink-3">{l.topicTitle}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs">{fmtDateTime(l.openedAt)}</p>
                  {l.completedAt ? <Badge tone="green">tugatgan</Badge> : <span className="text-[11px] text-ink-4">ochgan</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-ink-4">Vaqtlar 16.11.2026 dan boshlab yoziladi: undan oldingi kirishlar saqlanmagan.</p>
    </div>
  );
}

function Stats({ s }: { s: StudentDetail }) {
  const st = s.stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 py-2">
          <p className="text-lg font-extrabold">{st.lessonsCompleted}</p>
          <p className="text-[11px] text-ink-3">dars ko'rgan</p>
        </div>
        <div className="rounded-lg bg-surface-2 py-2">
          <p className="text-lg font-extrabold">{st.testsTaken}</p>
          <p className="text-[11px] text-ink-3">test ishlagan</p>
        </div>
        <div className="rounded-lg bg-surface-2 py-2">
          <p className="text-lg font-extrabold">{st.averagePercent !== null ? `${st.averagePercent}%` : "—"}</p>
          <p className="text-[11px] text-ink-3">o'rtacha natija</p>
        </div>
      </div>
      {st.recentAttempts.length > 0 && (
        <div>
          <p className="label">Oxirgi testlar</p>
          <div className="divide-y divide-line">
            {st.recentAttempts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-24 shrink-0 text-ink-3">{date(a.finishedAt)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                  {a.type === "MOCK" && <ClipboardCheck size={14} className="shrink-0 text-ink-4" aria-label="Mock" />}
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
          <div className="divide-y divide-line">
            {st.essays.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-24 shrink-0 text-ink-3">{date(e.createdAt)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                  {e.mode === "AI" ? <Bot size={14} className="shrink-0 text-ink-4" aria-label="AI" /> : <GraduationCap size={14} className="shrink-0 text-ink-4" aria-label="Ustoz" />}
                  <span className="truncate">{e.prompt}</span>
                </span>
                {e.score !== null ? <Badge tone="green">{formatScore(e.score)}/24</Badge> : <Badge>{ESSAY_STATUS_LABELS[e.status as EssayStatusName] ?? e.status}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!st.testsTaken && !st.lessonsCompleted && !st.essays.length && <p className="text-sm text-ink-3">Hali ilovadan foydalanmagan.</p>}
    </div>
  );
}
