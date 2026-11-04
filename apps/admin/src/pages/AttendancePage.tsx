import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AdminGroup, type AdminStudent, type AttendanceStatusName } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Clock, Copy, Link2, Plus, Search, Settings2, ShieldAlert, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, ConfirmButton, Empty, Field, Modal, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

/** Toshkent vaqti bo'yicha bugungi sana (UTC+5) */
const todayTashkent = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const GROUP_KEY = "onatili-attendance-group";

const STATUS_STYLE: Record<AttendanceStatusName, { on: string; short: string }> = {
  PRESENT: { on: "bg-emerald-600 text-white border-emerald-600", short: "Keldi" },
  LATE: { on: "bg-amber-500 text-white border-amber-500", short: "Kechikdi" },
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
  const [date, setDate] = useState(todayTashkent());
  const [view, setView] = useState<"day" | "month">("day");
  const [managing, setManaging] = useState(false);

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
        subtitle="Saqlanganda tasdiqlangan ota-onalarga Telegram orqali xabar boradi."
        actions={
          <button className="btn-secondary" onClick={() => setManaging(true)}>
            <Settings2 size={16} /> Guruhlar
          </button>
        }
      />

      {groups.isPending && <Spinner className="text-slate-400" />}
      {groups.data && active.length === 0 && (
        <Empty
          title="Hali guruh yo'q"
          hint="Offline guruh yarating va unga o'quvchilarni qo'shing."
          action={
            <button className="btn-primary" onClick={() => setManaging(true)}>
              <Plus size={16} /> Guruh yaratish
            </button>
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
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
              {([["day", "Kunlik"], ["month", "Oylik"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} className={`h-9 rounded-md px-3 ${view === k ? "bg-brand text-white" : "text-slate-600"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {view === "day" ? <DayView key={`${groupId}-${date}`} groupId={groupId} date={date} /> : <MonthView groupId={groupId} />}
        </>
      )}

      {managing && <GroupManager groups={groups.data ?? []} onClose={() => setManaging(false)} />}
    </>
  );
}

function ParentState({ s }: { s: AdminStudent }) {
  const approved = s.parents.filter((p) => p.status === "APPROVED");
  if (approved.length) return <span title={approved.map((p) => p.name).join(", ")} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck size={13} /> Ota-ona</span>;
  if (s.parents.length) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock size={13} /> Tekshirilmoqda</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><ShieldAlert size={13} /> Ota-ona yo'q</span>;
}

function DayView({ groupId, date }: { groupId: string; date: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const day = useQuery({ queryKey: ["attendance", groupId, date], queryFn: () => api.attendanceDay(groupId, date) });
  const [marks, setMarks] = useState<Record<string, AttendanceStatusName | null>>({});
  const [initial, setInitial] = useState<Record<string, AttendanceStatusName | null>>({});

  useEffect(() => {
    if (!day.data) return;
    const m = Object.fromEntries(day.data.rows.map((r) => [r.student.studentId, r.status]));
    setMarks(m);
    setInitial(m);
  }, [day.data]);

  const changed = useMemo(() => Object.keys(marks).filter((k) => marks[k] && marks[k] !== initial[k]), [marks, initial]);
  const unmarked = day.data?.rows.filter((r) => !marks[r.student.studentId]).length ?? 0;

  const save = useMutation({
    mutationFn: () =>
      api.saveAttendance(groupId, {
        date,
        items: Object.entries(marks)
          .filter(([, v]) => v)
          .map(([studentId, status]) => ({ studentId, status: status! })),
      }),
    onSuccess: (r) => {
      toast(r.notified ? `Saqlandi · ${r.notified} ta ota-onaga xabar yuborildi` : "Saqlandi");
      qc.invalidateQueries({ queryKey: ["attendance", groupId] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  if (day.isPending) return <Spinner className="text-slate-400" />;
  if (day.isError) return <p className="text-sm text-red-600">{errMsg(day.error)}</p>;
  if (day.data.rows.length === 0) return <Empty title="Guruhda o'quvchi yo'q" hint="«Guruhlar» tugmasi orqali o'quvchilarni qo'shing." />;

  return (
    <div className="pb-24">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-500">
          {day.data.rows.length} o'quvchi{unmarked ? ` · ${unmarked} ta belgilanmagan` : ""}
        </span>
        <span className="flex-1" />
        <button
          className="btn-secondary btn-sm"
          onClick={() => setMarks((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v ?? "PRESENT"])))}
          disabled={!unmarked}
        >
          <CheckCheck size={14} /> Qolganlar keldi
        </button>
      </div>
      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {day.data.rows.map(({ student: s, notifiedAt }) => {
          const cur = marks[s.studentId];
          return (
            <li key={s.studentId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate font-bold">{s.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <ParentState s={s} />
                  {notifiedAt && initial[s.studentId] === cur && <span className="text-[11px] text-slate-400">· xabar yuborilgan</span>}
                </div>
              </div>
              <div className="grid w-full grid-cols-4 gap-1 sm:w-auto">
                {ATTENDANCE_STATUSES.map((st) => (
                  <button
                    key={st}
                    onClick={() => setMarks((m) => ({ ...m, [s.studentId]: st }))}
                    className={`h-10 rounded-lg border px-2 text-xs font-bold transition sm:px-3 ${
                      cur === st ? STATUS_STYLE[st].on : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                    aria-pressed={cur === st}
                  >
                    {STATUS_STYLE[st].short}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Telefonda ham doim ko'rinadigan saqlash paneli */}
      <div
        // Telefonda pastki navigatsiya (64px) ustida turadi
        className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="text-sm text-slate-500">{changed.length ? `${changed.length} ta o'zgarish` : "O'zgarish yo'q"}</span>
          <span className="flex-1" />
          <button className="btn-primary" disabled={!changed.length || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Saqlash va yuborish
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
              </tr>
            </thead>
            <tbody>
              {m.data.rows.map((r) => {
                const present = Object.values(r.marks).filter((x) => x === "PRESENT" || x === "LATE").length;
                return (
                  <tr key={r.student.studentId} className="border-b border-slate-100 last:border-0">
                    <td className="sticky left-0 max-w-[160px] truncate bg-white px-4 py-2 font-semibold">{r.student.name}</td>
                    {m.data!.days.map((d) => {
                      const x = r.marks[d];
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          {x ? (
                            <span title={ATTENDANCE_LABELS[x]} className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-extrabold ${CELL[x]}`}>
                              {SYMBOL[x]}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">✓ keldi · ⏰ kechikdi · ✕ kelmadi · S sababli. «Kelgan» ustuniga kechikkanlar ham kiradi.</p>
    </>
  );
}

function GroupManager({ groups, onClose }: { groups: AdminGroup[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [sel, setSel] = useState<string>(groups[0]?.id ?? "");
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("");
  const [search, setSearch] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["group-students"] });
    qc.invalidateQueries({ queryKey: ["attendance"] });
  };

  const create = useMutation({
    mutationFn: () => api.createGroup({ name, schedule: schedule || null }),
    onSuccess: (g) => {
      setName("");
      setSchedule("");
      setSel(g.id);
      refresh();
      toast("Guruh yaratildi");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const students = useQuery({ queryKey: ["group-students", sel], queryFn: () => api.groupStudents(sel), enabled: Boolean(sel) });
  const found = useQuery({ queryKey: ["student-search", search], queryFn: () => api.searchStudents(search), enabled: search.trim().length >= 2 });
  const add = useMutation({ mutationFn: (id: string) => api.addToGroup(sel, [id]), onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  const remove = useMutation({ mutationFn: (id: string) => api.removeFromGroup(sel, id), onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  const toggle = useMutation({
    mutationFn: (g: AdminGroup) => api.updateGroup(g.id, { isActive: !g.isActive }),
    onSuccess: refresh,
    onError: (e) => toast(errMsg(e), "error"),
  });
  const del = useMutation({ mutationFn: (id: string) => api.deleteGroup(id), onSuccess: () => { setSel(""); refresh(); }, onError: (e) => toast(errMsg(e), "error") });
  const current = groups.find((g) => g.id === sel);
  const inGroup = new Set(students.data?.map((s) => s.studentId));

  return (
    <Modal title="Guruhlar" wide onClose={onClose}>
      <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="space-y-1">
            {groups.map((g) => (
              <button key={g.id} onClick={() => setSel(g.id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${sel === g.id ? "bg-brand-soft font-bold text-brand-dark" : "hover:bg-slate-50"}`}>
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {!g.isActive && <Badge>faol emas</Badge>}
                <span className="text-xs text-slate-400">{g.studentCount}</span>
              </button>
            ))}
          </div>
          <form
            className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <Field label="Yangi guruh">
              <input className="input" placeholder="Masalan: 1-guruh (ertalab)" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <input className="input" placeholder="Jadval: Du/Chor/Ju 14:00" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
            <button className="btn-primary w-full" disabled={!name.trim() || create.isPending}>
              <Plus size={16} /> Yaratish
            </button>
          </form>
        </div>

        <div className="min-w-0">
          {!current ? (
            <p className="text-sm text-slate-500">Guruhni tanlang yoki yarating</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{current.name}</p>
                  {current.schedule && <p className="text-xs text-slate-500">{current.schedule}</p>}
                </div>
                <button className="btn-secondary btn-sm" onClick={() => toggle.mutate(current)}>
                  {current.isActive ? "Faolsizlantirish" : "Faollashtirish"}
                </button>
                <ConfirmButton onConfirm={() => del.mutate(current.id)} label="O'chirilsinmi?">
                  <Trash2 size={14} />
                </ConfirmButton>
              </div>

              <InviteBox group={current} onChange={refresh} />

              <div className="relative mb-2">
                <Search size={16} className="absolute left-3 top-3.5 text-slate-400 sm:top-3" />
                <input className="input pl-9" placeholder="Yoki qidirib qo'shish (botga kirganlar): ism, @username, telefon" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {search.trim().length >= 2 && (
                <div className="mb-4 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {found.isPending && <Spinner className="text-slate-400" />}
                  {found.data?.length === 0 && <p className="p-2 text-sm text-slate-500">Topilmadi</p>}
                  {found.data?.map((s) => (
                    <div key={s.studentId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {[s.username && `@${s.username}`, s.phone, s.groupName && `guruh: ${s.groupName}`].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {inGroup.has(s.studentId) ? (
                        <Badge tone="green">guruhda</Badge>
                      ) : (
                        <button className="btn-secondary btn-sm" onClick={() => add.mutate(s.studentId)}>
                          <UserPlus size={14} /> Qo'shish
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="label">Guruhdagi o'quvchilar ({students.data?.length ?? 0})</p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {students.data?.length === 0 && <li className="p-3 text-sm text-slate-500">Hali o'quvchi yo'q</li>}
                {students.data?.map((s) => (
                  <li key={s.studentId} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                      <ParentState s={s} />
                    </div>
                    <button className="btn-ghost h-9 w-9 p-0 text-slate-400 hover:text-red-600" onClick={() => remove.mutate(s.studentId)} aria-label="Guruhdan chiqarish">
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Guruh havolasi: guruh chatiga tashlanadi, o'quvchi bosib o'zi qo'shiladi */
function InviteBox({ group, onChange }: { group: AdminGroup; onChange: () => void }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const reset = useMutation({ mutationFn: () => api.resetGroupInvite(group.id), onSuccess: onChange, onError: (e) => toast(errMsg(e), "error") });
  const off = useMutation({ mutationFn: () => api.disableGroupInvite(group.id), onSuccess: onChange, onError: (e) => toast(errMsg(e), "error") });
  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  if (!group.inviteUrl)
    return (
      <div className="mb-4 rounded-xl border border-dashed border-brand/40 bg-brand-soft/40 p-3">
        <p className="text-sm font-bold">Guruh havolasi</p>
        <p className="mt-1 text-xs text-slate-600">Havolani guruhning Telegram chatiga tashlang: o'quvchi bosadi, bot ochiladi va u shu guruhga avtomatik qo'shiladi. Qidirib o'tirish shart emas.</p>
        <button className="btn-primary btn-sm mt-2" disabled={reset.isPending} onClick={() => reset.mutate()}>
          <Link2 size={14} /> Havola yaratish
        </button>
      </div>
    );
  return (
    <div className="mb-4 rounded-xl border border-brand/40 bg-brand-soft/40 p-3">
      <p className="text-sm font-bold">Guruh havolasi</p>
      <div className="mt-2 flex items-center gap-2">
        <input readOnly className="input h-9 min-w-0 flex-1 bg-white text-xs" value={group.inviteUrl} onFocus={(e) => e.target.select()} />
        <button className="btn-primary btn-sm shrink-0" onClick={() => copy(group.inviteUrl!)}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Nusxalandi" : "Nusxalash"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-600">Guruh chatiga tashlang. Havolani bosgan har bir o'quvchi shu guruhga qo'shiladi va unga barcha darslar ochiladi.</p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
        <button className="text-brand-dark hover:underline" disabled={reset.isPending} onClick={() => confirm("Yangi havola yaratilsinmi? Eskisi ishlamay qoladi.") && reset.mutate()}>
          Yangi havola (eskisi ishlamaydi)
        </button>
        <button className="text-red-600 hover:underline" disabled={off.isPending} onClick={() => off.mutate()}>
          Havolani o'chirish
        </button>
      </div>
    </div>
  );
}
