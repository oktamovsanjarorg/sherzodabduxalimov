import { ATTENDANCE_LABELS, ESSAY_STATUS_LABELS, formatSum, monthLabel, type AttendanceStatusName, type EssayStatusName, type StudentDetail } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, Pencil, Phone, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, ConfirmButton, Field, Modal, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

const date = (iso: string) => new Date(iso).toLocaleDateString("ru-RU");
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
  const navigate = useNavigate();
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
  const del = useMutation({
    mutationFn: () => api.deleteStudent(s.studentId),
    onSuccess: () => {
      toast("O'chirildi");
      qc.invalidateQueries({ queryKey: ["roster"] });
      navigate("/students", { replace: true });
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
          {!s.telegramLinked && (
            <ConfirmButton label="O'quvchi o'chirilsinmi?" onConfirm={() => del.mutate()}>
              <Trash2 size={14} />
            </ConfirmButton>
          )}
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
  return (
    <div className="space-y-3">
      {s.parentList.length === 0 && <p className="text-sm text-slate-500">Ota-ona ulanmagan.</p>}
      {s.parentList.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-sm">
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
      ))}
      <div>
        <p className="mb-1 text-xs text-slate-500">Ota-onaga yuboring: bosib, botda raqamini ulashadi (keyin «Ota-onalar» bo'limida tasdiqlaysiz)</p>
        <CopyField value={s.parentInviteUrl} />
      </div>
    </div>
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
            <span className="w-24 shrink-0 text-slate-500">{new Date(a.date).toLocaleDateString("ru-RU")}</span>
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
  const mark = useMutation({
    mutationFn: (month: string) => api.markOffline({ studentId: s.studentId, month, note: "Naqd" }),
    onSuccess: () => {
      toast("To'lov belgilandi");
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
                  <Badge tone="green">
                    {m.amountUzs ? `${formatSum(m.amountUzs)} so'm` : "to'langan"}
                    {m.note ? ` · ${m.note}` : ""}
                  </Badge>
                ) : (
                  <>
                    <Badge tone="red">to'lanmagan</Badge>
                    <button className="btn-primary btn-sm" disabled={mark.isPending} onClick={() => mark.mutate(m.month)}>
                      To'ladi
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Summa guruhning oylik summasidan olinadi. Boshqa summa uchun: Ko'proq → To'lovlar → Offline guruhlar.</p>
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
                <span className="min-w-0 flex-1 truncate">
                  {a.type === "MOCK" ? "📋 " : ""}
                  {a.title}
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
                <span className="min-w-0 flex-1 truncate">
                  {e.mode === "AI" ? "🤖 " : "👨‍🏫 "}
                  {e.prompt}
                </span>
                {e.score !== null ? <Badge tone="green">{e.score}/24</Badge> : <Badge>{ESSAY_STATUS_LABELS[e.status as EssayStatusName] ?? e.status}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!st.testsTaken && !st.lessonsCompleted && !st.essays.length && <p className="text-sm text-slate-500">Hali ilovadan foydalanmagan.</p>}
    </div>
  );
}
