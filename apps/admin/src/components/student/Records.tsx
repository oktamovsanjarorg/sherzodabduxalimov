import { ATTENDANCE_LABELS, ESSAY_STATUS_LABELS, formatScore, type AttendanceStatusName, type EssayStatusName, type StudentDetail } from "@onatili/shared";
import { Bot, ClipboardCheck, GraduationCap } from "lucide-react";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { Badge } from "../ui";
import { Section } from "./shared";

const date = fmtDate;
const ATT_TONE: Record<AttendanceStatusName, "green" | "amber" | "red" | "blue"> = { PRESENT: "green", LATE: "amber", ABSENT: "red", EXCUSED: "blue" };

/** Natijalar: offline (milliy) testlar va ilovadagi testlar/esselar */
export function StudentResults({ s }: { s: StudentDetail }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Section title="Offline testlar" hint="Skaner orqali import qilingan mock natijalari">
        <ExternalResults s={s} />
      </Section>
      <Section title="Ilovada" hint="Darslar, testlar va esselar">
        <Stats s={s} />
      </Section>
    </div>
  );
}

export function StudentAttendance({ s }: { s: StudentDetail }) {
  return (
    <Section title="Davomat">
      <Attendance s={s} />
    </Section>
  );
}

export function StudentActivity({ s }: { s: StudentDetail }) {
  return (
    <Section title="Faollik: bot va darslar">
      <Activity s={s} />
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
