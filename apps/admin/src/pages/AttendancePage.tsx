import { ATTENDANCE_LABELS, ATTENDANCE_MARKS, GRADE_MAX, GRADE_MIN, type AttendanceStatusName } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, MessageSquare, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Empty, PageHeader, Spinner, Segmented } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";
import { ParentState } from "../components/GroupManager";

/** Toshkent vaqti bo'yicha bugungi sana (UTC+5) */
const todayTashkent = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const GROUP_KEY = "onatili-attendance-group";

const STATUS_STYLE: Record<AttendanceStatusName, { on: string; short: string }> = {
  PRESENT: { on: "bg-emerald-600 text-white border-emerald-600", short: "Keldi" },
  LATE: { on: "bg-amber-500 text-white border-amber-500", short: "Kechikdi" }, // eski yozuvlar
  ABSENT: { on: "bg-red-600 text-white border-red-600", short: "Kelmadi" },
  EXCUSED: { on: "bg-slate-500 text-white border-slate-500", short: "Sababli" },
};
const SYMBOL: Record<AttendanceStatusName, string> = { PRESENT: "✓", LATE: "⏰", ABSENT: "✕", EXCUSED: "S" };
const CELL: Record<AttendanceStatusName, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  LATE: "bg-amber-100 text-amber-800",
  ABSENT: "bg-red-100 text-red-700",
  EXCUSED: "bg-slate-100 text-slate-600",
};

export function AttendancePage() {
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.groups });
  const [params] = useSearchParams();
  const [groupId, setGroupId] = useState<string>(() => params.get("group") ?? localStorage.getItem(GROUP_KEY) ?? "");
  const [date, setDate] = useState(() => {
    const d = params.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayTashkent() ? d : todayTashkent();
  });
  const [view, setView] = useState<"day" | "month">("day");

  const active = (groups.data ?? []).filter((g) => g.isActive);
  useEffect(() => {
    if (!groups.data) return;
    if (!active.some((g) => g.id === groupId) && active[0]) setGroupId(active[0].id);
  }, [groups.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (groupId) localStorage.setItem(GROUP_KEY, groupId);
  }, [groupId]);

  return (
    <>
      <PageHeader
        title="Davomat"
        subtitle="Davomat va baholarni saqlang, so'ng «Ota-onalarga yuborish» tugmasi bilan Telegram orqali xabar yuboring."
      />

      {groups.isPending && <Spinner className="text-slate-400" />}
      {groups.data && active.length === 0 && (
        <Empty
          title="Hali guruh yo'q"
          hint="Guruhlar «O'quvchilar» bo'limida yaratiladi va boshqariladi."
          action={
            <Link className="btn-primary" to="/students?groups=1">
              <Plus size={16} /> Guruh yaratish
            </Link>
          }
        />
      )}

      {active.length > 0 && groupId && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="w-full sm:w-auto">
              <label className="label">Guruh</label>
              <select className="input sm:w-64" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                {active.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.studentCount})
                  </option>
                ))}
              </select>
            </div>
            {view === "day" ? (
              <div>
                <label className="label">Sana</label>
                <input type="date" className="input" value={date} max={todayTashkent()} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </div>
            ) : null}
            <Segmented value={view} onChange={setView} options={[["day", "Kunlik"], ["month", "Oylik"]] as const} />
          </div>
          {view === "day" ? <DayView key={`${groupId}-${date}`} groupId={groupId} date={date} /> : <MonthView groupId={groupId} />}
        </>
      )}

    </>
  );
}

type Mark = { status: AttendanceStatusName | null; grade: number | null; note: string };
const EMPTY: Mark = { status: null, grade: null, note: "" };
const sameMark = (a: Mark, b: Mark) => a.status === b.status && a.grade === b.grade && a.note.trim() === b.note.trim();

function DayView({ groupId, date }: { groupId: string; date: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const day = useQuery({ queryKey: ["attendance", groupId, date], queryFn: () => api.attendanceDay(groupId, date) });
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [initial, setInitial] = useState<Record<string, Mark>>({});
  const [openNote, setOpenNote] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!day.data) return;
    const m = Object.fromEntries(day.data.rows.map((r) => [r.student.studentId, { status: r.status, grade: r.grade, note: r.note ?? "" }]));
    setMarks(m);
    setInitial(m);
  }, [day.data]);

  const get = (id: string) => marks[id] ?? EMPTY;
  const patch = (id: string, p: Partial<Mark>) => setMarks((m) => ({ ...m, [id]: { ...(m[id] ?? EMPTY), ...p } }));

  const changed = useMemo(() => Object.keys(marks).filter((k) => marks[k].status && !sameMark(marks[k], initial[k] ?? EMPTY)), [marks, initial]);
  const unmarked = day.data?.rows.filter((r) => !marks[r.student.studentId]?.status).length ?? 0;
  // Saqlangan, lekin ota-onaga hali yuborilmagan yozuvlar
  const unsent = day.data?.rows.filter((r) => r.status && !r.notifiedAt).length ?? 0;

  const save = useMutation({
    mutationFn: () =>
      api.saveAttendance(groupId, {
        date,
        items: Object.entries(marks)
          .filter(([, v]) => v.status === "PRESENT" || v.status === "ABSENT")
          .map(([studentId, v]) => ({ studentId, status: v.status as "PRESENT" | "ABSENT", grade: v.status === "PRESENT" ? v.grade : null, note: v.note.trim() || null })),
      }),
    onSuccess: () => {
      toast("Saqlandi");
      qc.invalidateQueries({ queryKey: ["attendance", groupId] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  const send = useMutation({
    mutationFn: () => api.notifyAttendance(groupId, date),
    onSuccess: (r) => {
      const parts = [r.notified ? `${r.students} ta o'quvchi bo'yicha ${r.notified} ta xabar yuborildi` : "Yuboriladigan xabar yo'q"];
      if (r.withoutParent) parts.push(`${r.withoutParent} tasida tasdiqlangan ota-ona yo'q`);
      toast(parts.join(" · "));
      qc.invalidateQueries({ queryKey: ["attendance", groupId] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  if (day.isPending) return <Spinner className="text-slate-400" />;
  if (day.isError) return <p className="text-sm text-red-600">{errMsg(day.error)}</p>;
  if (day.data.rows.length === 0) return <Empty title="Guruhda o'quvchi yo'q" hint="«Guruhlar» tugmasi orqali o'quvchilarni qo'shing." />;

  return (
    <div className="pb-28">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-500">
          {day.data.rows.length} o'quvchi{unmarked ? ` · ${unmarked} ta belgilanmagan` : ""}
        </span>
        <span className="flex-1" />
        <button
          className="btn-secondary btn-sm"
          onClick={() => setMarks((m) => Object.fromEntries(day.data.rows.map((r) => [r.student.studentId, m[r.student.studentId]?.status ? m[r.student.studentId] : { ...(m[r.student.studentId] ?? EMPTY), status: "PRESENT" as const }])))}
          disabled={!unmarked}
        >
          <CheckCheck size={14} /> Qolganlar keldi
        </button>
      </div>
      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {day.data.rows.map(({ student: s, notifiedAt }) => {
          const cur = get(s.studentId);
          const dirty = !sameMark(cur, initial[s.studentId] ?? EMPTY);
          const showNote = openNote[s.studentId] || cur.note.length > 0;
          return (
            <li key={s.studentId} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate font-bold">{s.name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <ParentState s={s} />
                    {cur.status && !dirty && (notifiedAt ? <span className="text-[11px] text-emerald-600">· ota-onaga yuborilgan</span> : <span className="text-[11px] text-amber-600">· yuborilmagan</span>)}
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-1 sm:w-48">
                  {ATTENDANCE_MARKS.map((st) => (
                    <button
                      key={st}
                      onClick={() => patch(s.studentId, { status: st, ...(st === "ABSENT" ? { grade: null } : {}) })}
                      className={`h-10 rounded-lg border px-2 text-xs font-bold transition ${
                        cur.status === st ? STATUS_STYLE[st].on : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      aria-pressed={cur.status === st}
                    >
                      {STATUS_STYLE[st].short}
                    </button>
                  ))}
                </div>
              </div>
              {cur.status && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {cur.status === "PRESENT" && (
                    <div className="flex items-center gap-1" role="group" aria-label="Dars bahosi">
                      <span className="mr-1 text-xs font-semibold text-slate-500">Baho</span>
                      {Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, i) => GRADE_MIN + i).map((g) => (
                        <button
                          key={g}
                          onClick={() => patch(s.studentId, { grade: cur.grade === g ? null : g })}
                          className={`h-9 w-9 rounded-lg border text-sm font-extrabold transition ${
                            cur.grade === g ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                          aria-pressed={cur.grade === g}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                  {!showNote && (
                    <button className="btn-secondary btn-sm" onClick={() => setOpenNote((o) => ({ ...o, [s.studentId]: true }))}>
                      <MessageSquare size={14} /> Izoh
                    </button>
                  )}
                  {showNote && (
                    <input
                      className="input h-9 min-w-0 flex-1 basis-48 text-sm"
                      placeholder={cur.status === "PRESENT" ? "Izoh (masalan: faol edi, uy vazifasi yo'q)" : "Sabab (masalan: kasal)"}
                      maxLength={300}
                      value={cur.note}
                      onChange={(e) => patch(s.studentId, { note: e.target.value })}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Telefonda ham doim ko'rinadigan panel */}
      <div
        // Telefonda pastki navigatsiya (64px) ustida turadi
        className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">{changed.length ? `${changed.length} ta o'zgarish saqlanmagan` : unsent ? `${unsent} ta yozuv ota-onaga yuborilmagan` : "O'zgarish yo'q"}</span>
          <span className="flex-1" />
          <button className="btn-secondary" disabled={!changed.length || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Saqlash
          </button>
          <button
            className="btn-primary"
            disabled={changed.length > 0 || unsent === 0 || send.isPending}
            title={changed.length ? "Avval o'zgarishlarni saqlang" : undefined}
            onClick={() => send.mutate()}
          >
            {send.isPending ? <Spinner /> : <Send size={14} />} Ota-onalarga yuborish{unsent ? ` (${unsent})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthView({ groupId }: { groupId: string }) {
  const [month, setMonth] = useState(todayTashkent().slice(0, 7));
  const m = useQuery({ queryKey: ["attendance-month", groupId, month], queryFn: () => api.attendanceMonth(groupId, month) });
  return (
    <>
      <div className="mb-3">
        <label className="label">Oy</label>
        <input type="month" className="input w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      {m.isPending && <Spinner className="text-slate-400" />}
      {m.data && m.data.days.length === 0 && <Empty title="Bu oyda davomat olinmagan" />}
      {m.data && m.data.days.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="sticky left-0 bg-white px-4 py-2 text-left">O'quvchi</th>
                {m.data.days.map((d) => (
                  <th key={d} className="px-1 py-2 font-bold">{d.slice(8)}</th>
                ))}
                <th className="px-3 py-2">Kelgan</th>
                <th className="px-3 py-2">O'rtacha baho</th>
              </tr>
            </thead>
            <tbody>
              {m.data.rows.map((r) => {
                const present = Object.values(r.marks).filter((x) => x === "PRESENT" || x === "LATE").length;
                const gs = Object.values(r.grades);
                const avg = gs.length ? (gs.reduce((a, b) => a + b, 0) / gs.length).toFixed(1) : "–";
                return (
                  <tr key={r.student.studentId} className="border-b border-slate-100 last:border-0">
                    <td className="sticky left-0 max-w-[160px] truncate bg-white px-4 py-2 font-semibold">{r.student.name}</td>
                    {m.data!.days.map((d) => {
                      const x = r.marks[d];
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          {x ? (
                            <span title={`${ATTENDANCE_LABELS[x]}${r.grades[d] ? ` · baho ${r.grades[d]}` : ""}`} className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-extrabold ${CELL[x]}`}>
                              {r.grades[d] ?? SYMBOL[x]}
                            </span>
                          ) : (
                            <span className="text-slate-300">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-bold">
                      {present}/{m.data!.days.length}
                    </td>
                    <td className="px-3 py-2 text-center font-bold">{avg}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Yashil raqam — dars bahosi, ✓ — keldi (bahosiz), ✕ — kelmadi. Eski yozuvlarda: ⏰ kechikkan, S sababli.</p>
    </>
  );
}
