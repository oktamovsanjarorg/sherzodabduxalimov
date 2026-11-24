import type { AdminGroup } from "@onatili/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { EditGroupForm, NewGroupForm, ScheduleHint } from "./GroupForms";
import { GroupMembers } from "./GroupMembers";
import { Badge, ConfirmButton, Modal } from "./ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

/** Offline guruhlar: yaratish, nomi va jadvali, o'quvchilar, o'chirish */
export function GroupManager({ groups, onClose }: { groups: AdminGroup[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string>(groups[0]?.id ?? "");
  // Guruh nomi va jadvali davomat eslatmalari (dashboard) hamda o'quvchilar ro'yxatida ham ko'rinadi
  const refresh = () => {
    for (const k of ["groups", "group-students", "attendance", "dashboard", "roster"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const current = groups.find((g) => g.id === sel);

  return (
    <Modal title="Guruhlar" wide onClose={onClose}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="space-y-1">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSel(g.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${sel === g.id ? "bg-brand-soft font-bold text-brand-light" : "hover:bg-surface-2"}`}
              >
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {!g.isActive && <Badge>faol emas</Badge>}
                <span className="text-xs text-ink-4">{g.studentCount}</span>
              </button>
            ))}
          </div>
          <NewGroupForm
            onCreated={(g) => {
              setSel(g.id);
              refresh();
            }}
          />
        </div>

        <div className="min-w-0">
          {!current ? (
            <p className="text-sm text-ink-3">Guruhni tanlang yoki yarating</p>
          ) : (
            // key: boshqa guruh tanlansa tahrir formasi va qidiruvlar tozalanadi
            <div key={current.id}>
              <GroupHeader group={current} refresh={refresh} onDeleted={() => setSel("")} />
              <GroupMembers groupId={current.id} refresh={refresh} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Guruh nomi, jadvali va amallar; «Tahrirlash» bosilsa o'rnida forma ochiladi */
function GroupHeader({ group, refresh, onDeleted }: { group: AdminGroup; refresh: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const toggle = useMutation({
    mutationFn: () => api.updateGroup(group.id, { isActive: !group.isActive }),
    onSuccess: refresh,
    onError: (e) => toast(errMsg(e), "error"),
  });
  const del = useMutation({
    mutationFn: () => api.deleteGroup(group.id),
    onSuccess: () => {
      onDeleted();
      refresh();
      toast("Guruh o'chirildi. Korzinkadan 30 kun ichida tiklash mumkin");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  if (editing)
    return (
      <EditGroupForm
        group={group}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          refresh();
        }}
      />
    );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1 basis-full sm:basis-0">
        <p className="font-extrabold [overflow-wrap:anywhere]">{group.name}</p>
        {group.schedule && <p className="text-xs text-ink-3 [overflow-wrap:anywhere]">{group.schedule}</p>}
        <ScheduleHint schedule={group.schedule} />
      </div>
      <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
        <Pencil size={14} /> Tahrirlash
      </button>
      <button className="btn-secondary btn-sm" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
        {group.isActive ? "Faolsizlantirish" : "Faollashtirish"}
      </button>
      <ConfirmButton onConfirm={() => del.mutate()} label="O'chirilsinmi?">
        <Trash2 size={14} />
      </ConfirmButton>
    </div>
  );
}
