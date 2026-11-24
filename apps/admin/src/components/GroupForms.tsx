import { scheduleHint, type AdminGroup } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { CalendarCheck, Plus, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { Field, Spinner } from "./ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

/** Tizim jadvalni qanday tushungani: ustoz xato yozuvni saqlashdan oldin ko'radi */
export function ScheduleHint({ schedule, id }: { schedule: string | null; id?: string }) {
  const h = scheduleHint(schedule);
  const Icon = h.ok ? CalendarCheck : TriangleAlert;
  return (
    <p id={id} aria-live="polite" className={`mt-1 flex items-start gap-1.5 text-xs ${h.ok ? "text-emerald-700" : "text-amber-700"}`}>
      <Icon size={14} className="mt-px shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{h.text}</span>
    </p>
  );
}

function ScheduleField({ value, onChange, showHint = true }: { value: string; onChange: (v: string) => void; showHint?: boolean }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        Jadval
      </label>
      <input
        id={id}
        aria-describedby={showHint ? `${id}-hint` : undefined}
        className="input"
        maxLength={200}
        placeholder="Masalan: Du/Chor/Ju 14:00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {showHint && <ScheduleHint id={`${id}-hint`} schedule={value} />}
    </div>
  );
}

export function NewGroupForm({ onCreated }: { onCreated: (g: AdminGroup) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("");
  const create = useMutation({
    mutationFn: () => api.createGroup({ name: name.trim(), schedule: schedule.trim() || null }),
    onSuccess: (g) => {
      setName("");
      setSchedule("");
      onCreated(g);
      toast("Guruh yaratildi");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <form
      className="space-y-2 rounded-xl border border-dashed border-line-strong p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && !create.isPending) create.mutate();
      }}
    >
      <Field label="Yangi guruh">
        <input className="input" maxLength={100} placeholder="Masalan: 1-guruh (ertalab)" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {/* Tegilmagan bo'sh formada ogohlantirish chiqmaydi */}
      <ScheduleField value={schedule} onChange={setSchedule} showHint={Boolean(name.trim() || schedule.trim())} />
      <button className="btn-primary w-full" disabled={!name.trim() || create.isPending}>
        {create.isPending ? <Spinner /> : <Plus size={16} />} Yaratish
      </button>
    </form>
  );
}

/** Mavjud guruhning nomi va jadvali */
export function EditGroupForm({ group, onSaved, onCancel }: { group: AdminGroup; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(group.name);
  const [schedule, setSchedule] = useState(group.schedule ?? "");
  const d = { name: name.trim(), schedule: schedule.trim() || null };
  const changed = d.name !== group.name || d.schedule !== group.schedule;
  const save = useMutation({
    mutationFn: () => api.updateGroup(group.id, d),
    onSuccess: () => {
      onSaved();
      toast("Guruh saqlandi");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const can = Boolean(d.name) && changed && !save.isPending;
  return (
    <form
      className="mb-4 space-y-3 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (can) save.mutate();
      }}
    >
      <Field label="Guruh nomi">
        <input className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <ScheduleField value={schedule} onChange={setSchedule} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!can}>
          {save.isPending && <Spinner />} Saqlash
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Bekor qilish
        </button>
      </div>
    </form>
  );
}
