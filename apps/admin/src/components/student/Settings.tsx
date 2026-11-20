import type { StudentDetail } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg } from "../../lib/api";
import { loadSession } from "../../lib/session";
import { useToast } from "../../lib/toast";
import { Field, Modal } from "../ui";
import { Section } from "./shared";

/** Sozlamalar: guruh, boshlagan sana, ilovaga kirish, bloklash, o'chirish. Kirish va bloklash faqat egaga */
export function StudentSettings({ s }: { s: StudentDetail }) {
  const isTeacher = loadSession()?.user.role === "TEACHER";
  return (
    <div className="space-y-4">
      <Basics s={s} />
      {isTeacher && <Access s={s} />}
      {isTeacher && <Block s={s} />}
      <Delete s={s} isTeacher={isTeacher} />
    </div>
  );
}

function useRefresh(s: StudentDetail) {
  const qc = useQueryClient();
  return (d?: StudentDetail) => {
    if (d) qc.setQueryData(["student", s.studentId], d);
    else qc.invalidateQueries({ queryKey: ["student", s.studentId] });
    qc.invalidateQueries({ queryKey: ["roster"] });
    qc.invalidateQueries({ queryKey: ["groups"] });
  };
}

/** Guruh va o'qishni boshlagan sana (birinchi to'lov davri shundan), ism/telefon */
function Basics({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const refresh = useRefresh(s);
  const [editing, setEditing] = useState(false);
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.groups });
  const save = useMutation({
    mutationFn: (d: { groupId?: string | null; startedOn?: string | null }) => api.updateStudent(s.studentId, d),
    onSuccess: (_r, d) => {
      toast("groupId" in d ? "Guruh o'zgartirildi" : "O'qishni boshlagan sana saqlandi");
      refresh();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Section title="Asosiy ma'lumot">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Guruh">
          <select className="input" value={s.group?.id ?? ""} disabled={save.isPending} onChange={(e) => save.mutate({ groupId: e.target.value || null })}>
            <option value="">Guruhsiz (online)</option>
            {groups.data
              ?.filter((g) => g.isActive || g.id === s.group?.id)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="O'qishni boshlagan sana" hint={s.startedOn ? "Birinchi to'lov davri shu sanadan boshlanadi" : "Kiritilmagan: to'lov davri va qarz hisoblanmaydi"}>
          <input
            type="date"
            className={`input ${s.startedOn ? "" : "border-amber-400"}`}
            value={s.startedOn ?? ""}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ startedOn: e.target.value || null })}
          />
        </Field>
      </div>
      <button className="btn-secondary btn-sm mt-3" onClick={() => setEditing(true)}>
        Ism va telefonni tahrirlash
      </button>
      {editing && <EditModal s={s} onClose={() => setEditing(false)} onDone={() => refresh()} />}
    </Section>
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

const MODES = [
  ["AUTO", "Avtomatik", "Obuna yoki offline guruh bo'yicha"],
  ["FREE", "Bepul ochiq", "To'lovsiz va tasdiqsiz hamma narsa ochiq"],
  ["CLOSED", "Yopiq", "Pullik kontent yopiq (obuna/guruh bo'lsa ham)"],
] as const;

function Access({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const refresh = useRefresh(s);
  const access = useMutation({
    mutationFn: (mode: "AUTO" | "FREE" | "CLOSED") => api.setStudentAccess(s.studentId, mode),
    onSuccess: (d) => {
      toast("Saqlandi");
      refresh(d);
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Section title="Ilovaga kirish" hint={<>Hozir: {s.hasAccess ? <b className="text-emerald-700">darslar ochiq</b> : <b className="text-red-600">darslar yopiq</b>}</>}>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map(([m, label, hint]) => (
          <button
            key={m}
            disabled={access.isPending}
            onClick={() => m !== s.accessMode && access.mutate(m)}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm ${s.accessMode === m ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}
          >
            <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${s.accessMode === m ? "border-brand bg-brand" : "border-line-strong"}`} />
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="block text-xs text-ink-3">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function Block({ s }: { s: StudentDetail }) {
  const toast = useToast();
  const refresh = useRefresh(s);
  const [reason, setReason] = useState("");
  const block = useMutation({
    mutationFn: (blocked: boolean) => api.blockStudent(s.studentId, blocked, reason.trim() || null),
    onSuccess: (d) => {
      toast(d.blocked ? "Bloklandi" : "Blokdan chiqarildi");
      setReason("");
      refresh(d);
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Section title="Bloklash" hint="Bloklangan o'quvchi ilovani umuman ocha olmaydi. Ma'lumotlari saqlanadi.">
      {s.blocked ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Bloklangan{s.blockedReason ? `: ${s.blockedReason}` : ""}</p>
          <button className="btn-secondary btn-sm" disabled={block.isPending} onClick={() => block.mutate(false)}>
            Blokdan chiqarish
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="input h-10 flex-1 text-sm sm:h-9" placeholder="Sabab (ixtiyoriy, o'quvchiga ko'rinadi)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-danger btn-sm" disabled={block.isPending} onClick={() => block.mutate(true)}>
            Bloklash
          </button>
        </div>
      )}
    </Section>
  );
}

function Delete({ s, isTeacher }: { s: StudentDetail; isTeacher: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  const first = s.name.split(" ")[0];
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
  if (s.telegramLinked && !isTeacher)
    return (
      <Section title="O'chirish">
        <p className="text-sm text-ink-3">Botdan foydalanayotgan o'quvchini faqat ustoz o'chira oladi. Guruhdan chiqarish uchun yuqoridagi guruh tanlovidan foydalaning.</p>
      </Section>
    );
  return (
    <Section
      title="O'chirish"
      hint={<>Barcha natijalari, davomati va to'lovlari bilan korzinkaga o'tadi: 30 kun ichida Ko'proq → Korzinka'dan tiklash mumkin.{s.telegramLinked && " Vaqtincha to'xtatish uchun bloklash yaxshiroq."}</>}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="input h-10 flex-1 text-sm sm:h-9" placeholder={`Tasdiqlash uchun "${first}" deb yozing`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="btn-danger btn-sm" disabled={confirm.trim().toLowerCase() !== first.toLowerCase() || del.isPending} onClick={() => del.mutate()}>
          <Trash2 size={13} /> O'chirish
        </button>
      </div>
    </Section>
  );
}
