import { ANNOUNCE_ROLE_LABELS, type AdminUserRow, type AnnounceAudience, type AnnouncePreview, type AnnounceRole } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Check, GraduationCap, Plus, UsersRound, X, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { SearchBox, Segmented, Toggle } from "../ui";

const ROLES: { key: AnnounceRole; Icon: LucideIcon; hint: string }[] = [
  { key: "STUDENT", Icon: GraduationCap, hint: "Botga ulangan o'quvchilar" },
  { key: "PARENT", Icon: UsersRound, hint: "Tasdiqlangan ota-onalar" },
  { key: "ASSISTANT", Icon: Briefcase, hint: "Yordamchilar va ustozlar" },
];

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Kimga yuboriladi: rollar, guruhlar, online/offline va qo'lda tanlangan odamlar */
export function AudiencePicker({
  value,
  onChange,
  preview,
  names,
  onName,
}: {
  value: AnnounceAudience;
  onChange: (a: AnnounceAudience) => void;
  preview?: AnnouncePreview;
  /** Tanlangan odamlarning ismlari (qidiruvdan qo'shilganda ma'lum bo'ladi) */
  names: Record<string, string>;
  onName: (id: string, name: string) => void;
}) {
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.groups });
  const [q, setQ] = useState("");
  const found = useQuery({
    queryKey: ["users", q],
    queryFn: () => api.users(q),
    enabled: q.trim().length >= 2,
  });
  const filtered = value.roles.some((r) => r !== "ASSISTANT");
  const set = (p: Partial<AnnounceAudience>) => onChange({ ...value, ...p });
  const mode = value.modes.length === 1 ? value.modes[0] : "ALL";
  const active = (groups.data ?? []).filter((g) => g.isActive);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {ROLES.map((r) => {
          const on = value.roles.includes(r.key);
          const n = preview?.byRole[r.key] ?? (r.key === "ASSISTANT" ? (preview?.byRole.TEACHER ?? 0) : undefined);
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={on}
              onClick={() => set({ roles: toggle(value.roles, r.key) })}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${on ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? "bg-brand text-white" : "bg-surface-3 text-ink-3"}`}>
                {on ? <Check size={18} /> : <r.Icon size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{ANNOUNCE_ROLE_LABELS[r.key]}</span>
                <span className="block truncate text-xs text-ink-3">{on && n !== undefined ? `${n} kishi` : r.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {filtered && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <div>
            <p className="label">Guruhlar</p>
            <div className="flex flex-wrap gap-2">
              <GroupChip on={!value.groupIds.length} onClick={() => set({ groupIds: [] })}>
                Hamma guruhlar
              </GroupChip>
              {active.map((g) => (
                <GroupChip key={g.id} on={value.groupIds.includes(g.id)} onClick={() => set({ groupIds: toggle(value.groupIds, g.id) })}>
                  {g.name} <span className="opacity-60">{g.studentCount}</span>
                </GroupChip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={mode}
              onChange={(m) => set({ modes: m === "ALL" ? [] : [m] })}
              options={
                [
                  ["ALL", "Hammasi"],
                  ["ONLINE", "Online"],
                  ["OFFLINE", "Offline"],
                ] as const
              }
            />
          </div>
          <Toggle
            checked={!value.onlyAccepted}
            onChange={(v) => set({ onlyAccepted: !v })}
            label="Yangi kelganlarni ham qo'shish"
            hint="Botdan o'zi kirgan, siz hali qabul qilmagan o'quvchilar (va ularning ota-onalari)"
          />
        </div>
      )}

      <div>
        <p className="label">Alohida odamlar {value.userIds.length ? `(${value.userIds.length})` : ""}</p>
        {!!value.userIds.length && (
          <div className="mb-2 flex flex-wrap gap-2">
            {value.userIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-3 py-1 pl-3 pr-1 text-sm font-semibold">
                {names[id] ?? "Tanlangan"}
                <button type="button" aria-label="Olib tashlash" className="rounded-full p-1 hover:bg-surface-4" onClick={() => set({ userIds: value.userIds.filter((x) => x !== id) })}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <SearchBox className="sm:w-full" value={q} onChange={setQ} placeholder="Ism, @username yoki telefon bo'yicha qo'shish" />
        {q.trim().length >= 2 && (
          <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {found.data?.length === 0 && <li className="px-3 py-2 text-sm text-ink-3">Topilmadi</li>}
            {found.data?.slice(0, 20).map((u: AdminUserRow) => {
              const picked = value.userIds.includes(u.userId);
              return (
                <li key={u.userId}>
                  <button
                    type="button"
                    disabled={picked || !u.telegramLinked}
                    onClick={() => {
                      onName(u.userId, u.name);
                      set({ userIds: [...value.userIds, u.userId] });
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.name}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {u.role === "PARENT" ? `Ota-ona · ${u.children.join(", ")}` : (u.group?.name ?? "Guruhsiz")}
                        {!u.telegramLinked && " · botga kirmagan"}
                      </span>
                    </span>
                    {picked ? <Check size={16} className="text-brand" /> : <Plus size={16} className="text-ink-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function GroupChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`h-9 rounded-full px-3.5 text-sm font-bold ${on ? "bg-ink text-page" : "bg-surface-3 text-ink-2 hover:bg-surface-4"}`}>
      {children}
    </button>
  );
}
