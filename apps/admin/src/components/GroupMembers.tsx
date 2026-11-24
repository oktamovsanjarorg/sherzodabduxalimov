import type { AdminStudent } from "@onatili/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { ParentState } from "./ParentState";
import { Badge, SearchBox, Spinner } from "./ui";
import { matches } from "../lib/search";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

/** Guruhdagi o'quvchilar: qidirib qo'shish, ro'yxat, chiqarish */
export function GroupMembers({ groupId, refresh }: { groupId: string; refresh: () => void }) {
  const students = useQuery({ queryKey: ["group-students", groupId], queryFn: () => api.groupStudents(groupId) });
  return (
    <>
      <AddStudents groupId={groupId} members={students.data} refresh={refresh} />
      <MemberList groupId={groupId} members={students.data} refresh={refresh} />
    </>
  );
}

type Props = { groupId: string; members: AdminStudent[] | undefined; refresh: () => void };

function AddStudents({ groupId, members, refresh }: Props) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const found = useQuery({ queryKey: ["student-search", search], queryFn: () => api.searchStudents(search), enabled: search.trim().length >= 2 });
  const add = useMutation({ mutationFn: (id: string) => api.addToGroup(groupId, [id]), onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  const inGroup = new Set(members?.map((s) => s.studentId));
  return (
    <>
      <div className="relative mb-2">
        <Search size={16} className="absolute left-3 top-3.5 text-ink-4 sm:top-3" />
        <input
          className="input pl-9"
          placeholder="Qidirib qo'shish (botga kirganlar): ism, @username, telefon"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {search.trim().length >= 2 && (
        <div className="mb-4 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
          {found.isPending && <Spinner className="text-ink-4" />}
          {found.data?.length === 0 && <p className="p-2 text-sm text-ink-3">Topilmadi</p>}
          {found.data?.map((s) => (
            <div key={s.studentId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="truncate text-xs text-ink-3">
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
    </>
  );
}

function MemberList({ groupId, members, refresh }: Props) {
  const toast = useToast();
  const [memberQ, setMemberQ] = useState("");
  const remove = useMutation({ mutationFn: (id: string) => api.removeFromGroup(groupId, id), onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="label mb-0">Guruhdagi o'quvchilar ({members?.length ?? 0})</p>
        {(members?.length ?? 0) > 8 && <SearchBox className="sm:w-56" value={memberQ} onChange={setMemberQ} placeholder="Guruhdan qidirish" />}
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {members?.length === 0 && <li className="p-3 text-sm text-ink-3">Hali o'quvchi yo'q</li>}
        {!!members?.length && memberQ.trim() && !members.some((s) => matches(memberQ, s.name, s.username, s.phone)) && (
          <li className="p-3 text-sm text-ink-3">«{memberQ.trim()}» bo'yicha topilmadi</li>
        )}
        {members
          ?.filter((s) => matches(memberQ, s.name, s.username, s.phone))
          .map((s) => (
            <li key={s.studentId} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <ParentState s={s} />
              </div>
              <button
                className="btn-ghost h-9 w-9 p-0 text-ink-4 hover:text-red-600"
                onClick={() => remove.mutate(s.studentId)}
                aria-label="Guruhdan chiqarish"
              >
                <X size={16} />
              </button>
            </li>
          ))}
      </ul>
    </>
  );
}
