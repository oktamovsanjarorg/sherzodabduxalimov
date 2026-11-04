import type { RosterRow } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ListPlus, Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Empty, Field, Modal, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { loadSession } from "../lib/session";
import { useToast } from "../lib/toast";

/** O'quvchilar: guruhni tanlaysiz, ro'yxat chiqadi, o'quvchini bossangiz hammasi bitta joyda */
export function StudentsPage() {
  const [params, setParams] = useSearchParams();
  const groupId = params.get("group") ?? "";
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<"one" | "bulk" | null>(null);
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.groups });
  const roster = useQuery({ queryKey: ["roster", groupId, q.trim()], queryFn: () => api.roster(groupId, q.trim()), placeholderData: (p) => p });
  const isTeacher = loadSession()?.user.role === "TEACHER";
  const active = groups.data?.filter((g) => g.isActive) ?? [];
  const setGroup = (g: string) => setParams(g ? { group: g } : {}, { replace: true });

  return (
    <>
      <PageHeader
        title="O'quvchilar"
        subtitle="O'quvchini o'zingiz kiriting: botga kirishi shart emas. Keyin u botda telefonini ulashsa, hisobi avtomatik bog'lanadi."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setAdding("bulk")}>
              <ListPlus size={16} /> Ro'yxat bilan
            </button>
            <button className="btn-primary" onClick={() => setAdding("one")}>
              <UserPlus size={16} /> O'quvchi qo'shish
            </button>
          </>
        }
      />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <Chip on={!groupId} onClick={() => setGroup("")}>
          Hammasi
        </Chip>
        {active.map((g) => (
          <Chip key={g.id} on={groupId === g.id} onClick={() => setGroup(g.id)}>
            {g.name} <span className="opacity-60">{g.studentCount}</span>
          </Chip>
        ))}
        <Chip on={groupId === "none"} onClick={() => setGroup("none")}>
          Online (guruhsiz)
        </Chip>
      </div>

      <div className="relative mb-3 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Ism, @username yoki telefon" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {roster.isPending && <Spinner className="text-slate-400" />}
      {roster.data?.length === 0 && (
        <Empty
          title={q ? "Topilmadi" : "Bu yerda hali o'quvchi yo'q"}
          hint={q ? undefined : "«O'quvchi qo'shish» yoki «Ro'yxat bilan» tugmasi orqali kiriting."}
        />
      )}
      {!!roster.data?.length && (
        <>
          <p className="mb-2 text-xs text-slate-500">{roster.data.length} ta o'quvchi</p>
          <div className="card divide-y divide-slate-100">
            {roster.data.map((r) => (
              <Row key={r.studentId} r={r} isTeacher={isTeacher} showGroup={!groupId} />
            ))}
          </div>
        </>
      )}

      {adding === "one" && <AddOneModal groupId={groupId === "none" ? "" : groupId} onClose={() => setAdding(null)} />}
      {adding === "bulk" && <BulkModal groupId={groupId === "none" ? "" : groupId} onClose={() => setAdding(null)} />}
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
      {children}
    </button>
  );
}

function Row({ r, isTeacher, showGroup }: { r: RosterRow; isTeacher: boolean; showGroup: boolean }) {
  const navigate = useNavigate();
  const soon = r.subscriptionEndsAt && new Date(r.subscriptionEndsAt).getTime() < Date.now() + 5 * 86_400_000;
  return (
    <button onClick={() => navigate(`/students/${r.studentId}`)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <p className="truncate font-semibold">{r.name}</p>
        <p className="truncate text-xs text-slate-500">
          {[r.phone, r.username && `@${r.username}`, showGroup && (r.group?.name ?? "online")].filter(Boolean).join(" · ") || "ma'lumot yo'q"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {r.blocked && <Badge tone="red">bloklangan</Badge>}
        {r.accessMode === "FREE" && <Badge tone="blue">bepul ochiq</Badge>}
        {r.accessMode === "CLOSED" && <Badge tone="red">kirish yopiq</Badge>}
        {!r.telegramLinked && <Badge tone="amber">botga kirmagan</Badge>}
        {r.parents.approved ? <Badge tone="green">ota-ona ✓</Badge> : r.parents.pending ? <Badge tone="blue">ota-ona kutilmoqda</Badge> : <Badge>ota-ona yo'q</Badge>}
        {isTeacher && r.paidThisMonth !== null && (r.paidThisMonth ? <Badge tone="green">shu oy to'lagan</Badge> : <Badge tone="red">qarzdor</Badge>)}
        {r.subscriptionEndsAt && (
          <Badge tone={soon ? "amber" : "green"}>obuna {new Date(r.subscriptionEndsAt).toLocaleDateString("ru-RU")} gacha</Badge>
        )}
        {r.attendance30.total > 0 && (
          <Badge tone={r.attendance30.absent > r.attendance30.total / 3 ? "red" : "gray"}>
            davomat {r.attendance30.present}/{r.attendance30.total}
          </Badge>
        )}
      </div>
      <ChevronRight size={18} className="hidden text-slate-400 sm:block" />
    </button>
  );
}

function GroupSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.groups });
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Guruhsiz (online o'quvchi)</option>
      {groups.data
        ?.filter((g) => g.isActive)
        .map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
    </select>
  );
}

function AddOneModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [d, setD] = useState({ firstName: "", lastName: "", phone: "", groupId });
  const save = useMutation({
    mutationFn: () => api.createStudent({ firstName: d.firstName.trim(), lastName: d.lastName.trim() || null, phone: d.phone.trim() || null, groupId: d.groupId || null }),
    onSuccess: (r) => {
      toast("O'quvchi qo'shildi");
      qc.invalidateQueries({ queryKey: ["roster"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      navigate(`/students/${r.studentId}`);
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title="O'quvchi qo'shish"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn-primary" disabled={d.firstName.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>
            <UserPlus size={16} /> Qo'shish
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ism">
            <input className="input" autoFocus value={d.firstName} onChange={(e) => setD({ ...d, firstName: e.target.value })} />
          </Field>
          <Field label="Familiya">
            <input className="input" value={d.lastName} onChange={(e) => setD({ ...d, lastName: e.target.value })} />
          </Field>
        </div>
        <Field label="Telefon" hint="O'quvchi botda shu raqamni ulashsa, hisobi avtomatik bog'lanadi">
          <input className="input" inputMode="tel" placeholder="90 123 45 67" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        </Field>
        <Field label="Guruh">
          <GroupSelect value={d.groupId} onChange={(v) => setD({ ...d, groupId: v })} />
        </Field>
      </div>
    </Modal>
  );
}

function BulkModal({ groupId: initial, onClose }: { groupId: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState(initial);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ added: number; skipped: { line: string; reason: string }[] } | null>(null);
  const lines = text.split("\n").filter((l) => l.trim()).length;
  const save = useMutation({
    mutationFn: () => api.bulkStudents(groupId || null, text),
    onSuccess: (r) => {
      setResult(r);
      toast(`${r.added} ta o'quvchi qo'shildi`);
      qc.invalidateQueries({ queryKey: ["roster"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      if (!r.skipped.length) onClose();
      else setText(r.skipped.map((s) => s.line).join("\n"));
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title="Ro'yxat bilan qo'shish"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Yopish
          </button>
          <button className="btn-primary" disabled={!lines || save.isPending} onClick={() => save.mutate()}>
            <ListPlus size={16} /> {lines ? `${lines} ta o'quvchini qo'shish` : "Qo'shish"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Guruh">
          <GroupSelect value={groupId} onChange={setGroupId} />
        </Field>
        <Field label="Ro'yxat" hint="Har qatorda bitta o'quvchi: «Ism Familiya, telefon». Telefon ixtiyoriy. Excel yoki Telegram'dan nusxalab qo'yish mumkin.">
          <textarea
            className="input min-h-[220px] py-2 font-mono text-sm"
            placeholder={"Aziz Karimov, 90 123 45 67\nMadina Aliyeva, 91 234 56 78\nJasur Toshmatov"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        {result && result.skipped.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-bold">
              {result.added} ta qo'shildi, {result.skipped.length} ta qo'shilmadi:
            </p>
            <ul className="mt-1 space-y-0.5">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  «{s.line}» — {s.reason}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">Qo'shilmaganlari yuqorida qoldi: tuzatib, qayta yuboring.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
