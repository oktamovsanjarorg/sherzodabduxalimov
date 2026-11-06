import type { AdminGroup, AdminStudent } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Copy, Link2, Plus, Search, ShieldAlert, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Badge, ConfirmButton, Field, Modal, Spinner } from "./ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

/** Offline guruhlar: yaratish, nomi va jadvali, o'quvchilar, taklif havolasi, o'chirish */
export function GroupManager({ groups, onClose }: { groups: AdminGroup[]; onClose: () => void }) {
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
        <ConfirmButton label="Eskisi ishlamay qoladi. Yangilansinmi?" className="text-brand-dark hover:underline" onConfirm={() => reset.mutate()}>
          Yangi havola (eskisi ishlamaydi)
        </ConfirmButton>
        <ConfirmButton label="Havola o'chirilsinmi?" className="text-red-600 hover:underline" onConfirm={() => off.mutate()}>
          Havolani o'chirish
        </ConfirmButton>
      </div>
    </div>
  );
}

/** O'quvchining ota-onasi holati (qisqa belgi) */
export function ParentState({ s }: { s: AdminStudent }) {
  const approved = s.parents.filter((p) => p.status === "APPROVED");
  if (approved.length) return <span title={approved.map((p) => p.name).join(", ")} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck size={13} /> Ota-ona</span>;
  if (s.parents.length) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock size={13} /> Tekshirilmoqda</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><ShieldAlert size={13} /> Ota-ona yo'q</span>;
}
