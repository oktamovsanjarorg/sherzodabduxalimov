import { DEFAULT_ASSISTANT_PERMISSIONS, PERMISSIONS, ROLE_LABELS, type Permission, type StaffList } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, SlidersHorizontal, UserPlus } from "lucide-react";
import { useState } from "react";
import { PermissionPicker, PermissionSummary } from "../components/PermissionPicker";
import { Badge, ConfirmButton, Modal, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { loadSession } from "../lib/session";
import { useToast } from "../lib/toast";

/** Tahrirlanayotgan yordamchi yoki taklif */
type Editing = { kind: "staff"; id: string; name: string; value: Permission[] } | { kind: "invite"; username: string; name: string; value: Permission[] };

export function StaffPage() {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["staff"], queryFn: api.staff });
  const [editing, setEditing] = useState<Editing | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  return (
    <>
      <PageHeader title="Xodimlar" subtitle="Yordamchini Telegram username orqali qo'shing va qaysi bo'limlarga kira olishini belgilang." />
      <AddForm onDone={refresh} />
      {staff.isPending && <Spinner className="text-ink-4" />}
      {staff.isError && <p className="text-sm text-red-600">{errMsg(staff.error)}</p>}
      {staff.data && <StaffRows data={staff.data} onEdit={setEditing} onChanged={refresh} />}
      {editing && <EditModal editing={editing} onClose={() => setEditing(null)} onDone={refresh} />}
    </>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [perms, setPerms] = useState<Permission[]>([...DEFAULT_ASSISTANT_PERMISSIONS]);
  const add = useMutation({
    mutationFn: () => api.addStaff({ username, permissions: perms }),
    onSuccess: (r) => {
      toast(r.status === "added" ? "Yordamchi qo'shildi" : "Taklif saqlandi: u botga kirganda shu ruxsatlar bilan yordamchi bo'ladi");
      setUsername("");
      setPerms([...DEFAULT_ASSISTANT_PERMISSIONS]);
      onDone();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <form
      className="card mb-6 space-y-4 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (username.trim()) add.mutate();
      }}
    >
      <h2 className="text-base font-extrabold">Yordamchi qo'shish</h2>
      <div>
        <label className="label" htmlFor="staff-username">
          Telegram username
        </label>
        <input id="staff-username" className="input" placeholder="@telegram_username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <p className="mt-1 text-xs text-ink-3">U botga /admin deb yozib kiradi. Hali botga kirmagan bo'lsa ham qo'shsa bo'ladi.</p>
      </div>
      <PermissionPicker value={perms} onChange={setPerms} />
      <button className="btn-primary w-full sm:w-auto" disabled={!username.trim() || add.isPending}>
        <UserPlus size={16} /> Qo'shish ({perms.length} ta ruxsat)
      </button>
    </form>
  );
}

function StaffRows({ data, onEdit, onChanged }: { data: StaffList; onEdit: (e: Editing) => void; onChanged: () => void }) {
  const toast = useToast();
  const me = loadSession()!.user;
  const opts = { onSuccess: onChanged, onError: (e: unknown) => toast(errMsg(e), "error") };
  const remove = useMutation({ mutationFn: (id: string) => api.removeStaff(id), ...opts });
  const removeInvite = useMutation({ mutationFn: (u: string) => api.removeInvite(u), ...opts });
  const editBtn = (e: Editing) => (
    <button className="btn-secondary btn-sm" onClick={() => onEdit(e)}>
      <SlidersHorizontal size={14} /> Ruxsatlar
    </button>
  );
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {data.staff.map((s) => {
        const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{s.firstName[0]}</span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-bold">
                {name} {s.id === me.id && <span className="text-xs font-semibold text-ink-4">(siz)</span>}
              </p>
              <p className="mb-1.5 text-xs text-ink-3">{s.username ? `@${s.username}` : "username yo'q"}</p>
              {s.role === "TEACHER" ? <p className="text-xs text-ink-3">Hamma bo'lim ochiq</p> : <PermissionSummary value={s.permissions} />}
            </div>
            <Badge tone={s.role === "TEACHER" ? "brand" : "blue"}>{s.isOwner ? "Ega" : ROLE_LABELS[s.role]}</Badge>
            {s.role === "ASSISTANT" && editBtn({ kind: "staff", id: s.id, name, value: s.permissions })}
            {!s.isOwner && s.id !== me.id && (
              <ConfirmButton onConfirm={() => remove.mutate(s.id)} label="Olib tashlansinmi?">
                Olib tashlash
              </ConfirmButton>
            )}
          </div>
        );
      })}
      {data.invites.map((i) => (
        <div key={i.username} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-4">
            <Clock size={18} />
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-bold">@{i.username}</p>
            <p className="mb-1.5 text-xs text-ink-3">Taklif qilingan: botga hali kirmagan</p>
            <PermissionSummary value={i.permissions} />
          </div>
          <Badge tone="amber">Kutilmoqda</Badge>
          {editBtn({ kind: "invite", username: i.username, name: `@${i.username}`, value: i.permissions })}
          <ConfirmButton onConfirm={() => removeInvite.mutate(i.username)} label="Bekor qilinsinmi?">
            Bekor qilish
          </ConfirmButton>
        </div>
      ))}
    </div>
  );
}

function EditModal({ editing, onClose, onDone }: { editing: Editing; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState<Permission[]>(PERMISSIONS.filter((p) => editing.value.includes(p)));
  const save = useMutation({
    mutationFn: () => (editing.kind === "staff" ? api.setStaffPermissions(editing.id, value) : api.setInvitePermissions(editing.username, value)),
    onSuccess: () => {
      toast("Ruxsatlar saqlandi");
      onDone();
      onClose();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal
      title={`${editing.name}: ruxsatlar`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </button>
        </>
      }
    >
      <PermissionPicker value={value} onChange={setValue} />
      <p className="mt-3 text-xs text-ink-3">O'zgarish darhol kuchga kiradi: yordamchi qayta kirishi shart emas.</p>
    </Modal>
  );
}
