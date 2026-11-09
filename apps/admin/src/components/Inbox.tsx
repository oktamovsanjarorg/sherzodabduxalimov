import type { AdminGroup, DuplicateRow, NewcomerRow } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Ban, BookOpen, ChevronRight, ClipboardList, FileText, Inbox as InboxIcon, Link2, Trash2, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, ConfirmButton } from "./ui";
import { api, errMsg } from "../lib/api";
import { fmtShortDateTime } from "../lib/format";
import { loadSession } from "../lib/session";
import { useToast } from "../lib/toast";
import { LinkCard } from "../pages/ParentsPage";

/**
 * "Ko'rib chiqish kerak": botdan o'zi kirgan yangi o'quvchilar (guruhga qo'shish / online qoldirish /
 * bloklash / o'chirish) va ota-ona so'rovlari (tasdiqlash / rad etish) — hammasi bitta joyda.
 */
export function Inbox({ groups }: { groups: AdminGroup[] }) {
  const news = useQuery({ queryKey: ["newcomers"], queryFn: api.newcomers, refetchInterval: 30_000 });
  const parents = useQuery({ queryKey: ["parent-links", "PENDING"], queryFn: () => api.parentLinks("PENDING"), refetchInterval: 30_000 });
  const isTeacher = loadSession()?.user.role === "TEACHER";
  const dups = useQuery({ queryKey: ["duplicates"], queryFn: api.duplicates, enabled: isTeacher, refetchInterval: 60_000 });
  const n = news.data?.length ?? 0;
  const p = parents.data?.length ?? 0;
  const d = dups.data?.length ?? 0;
  if (!n && !p && !d) return null;
  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-extrabold">
        <InboxIcon size={18} className="text-amber-700" /> Ko'rib chiqish kerak
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold text-white">{n + p + d}</span>
      </h2>
      {d > 0 && (
        <>
          <p className="mb-2 mt-3 text-sm font-bold text-slate-700">Bitta o'quvchi ikki marta ({d})</p>
          <p className="mb-3 text-xs text-slate-600">
            Chapda — botga kirgan hisob, o'ngda — siz qo'lda kiritgan yozuv. Bitta odam bo'lsa, birlashtiring: ism, guruh, davomat va to'lovlar botdagi hisobga o'tadi, ortiqcha yozuv yo'qoladi.
          </p>
          <div className="space-y-2">
            {dups.data!.map((r) => (
              <Duplicate key={r.placeholder.id} r={r} />
            ))}
          </div>
        </>
      )}
      {n > 0 && (
        <>
          <p className="mb-2 mt-3 text-sm font-bold text-slate-700">Botdan yangi kirganlar ({n})</p>
          <p className="mb-3 text-xs text-slate-600">O'quvchingiz bo'lsa — guruhiga qo'shing yoki online o'quvchi deb belgilang. Begona bo'lsa — bloklang yoki o'chiring.</p>
          <div className="space-y-2">
            {news.data!.map((s) => (
              <Newcomer key={s.studentId} s={s} groups={groups.filter((g) => g.isActive)} />
            ))}
          </div>
        </>
      )}
      {p > 0 && (
        <>
          <p className="mb-2 mt-5 flex items-center justify-between text-sm font-bold text-slate-700">
            <span>Ota-ona so'rovlari ({p})</span>
            <Link to="/parents" className="text-xs font-bold text-brand hover:underline">
              Tasdiqlangan va rad etilganlar →
            </Link>
          </p>
          <p className="mb-3 text-xs text-slate-600">Raqamga qo'ng'iroq qilib, haqiqatan ota-onasi ekanini tekshiring.</p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {parents.data!.map((l) => (
              <LinkCard key={l.id} link={l} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Newcomer({ s, groups }: { s: NewcomerRow; groups: AdminGroup[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const isTeacher = loadSession()?.user.role === "TEACHER";
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const done = (msg: string) => {
    toast(msg);
    for (const k of ["newcomers", "roster", "groups", "dashboard"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const accept = useMutation({
    mutationFn: (g: string | null) => api.acceptStudent(s.studentId, g),
    onSuccess: (_r, g) => done(g ? `${s.name} guruhga qo'shildi` : `${s.name} online o'quvchi sifatida qoldi`),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const block = useMutation({
    mutationFn: () => api.blockStudent(s.studentId, true, "Begona: ustoz o'quvchisi emas"),
    onSuccess: () => done(`${s.name} bloklandi`),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const del = useMutation({
    mutationFn: () => api.deleteStudent(s.studentId, true),
    onSuccess: () => done(`${s.name} o'chirildi`),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const link = useMutation({
    mutationFn: (placeholderId: string) => api.linkStudent(s.studentId, placeholderId),
    onSuccess: (r) => done(`${r.name} Telegram hisobiga ulandi`),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const busy = accept.isPending || block.isPending || del.isPending || link.isPending;
  const act = s.activity;
  return (
    <div className="card flex flex-wrap items-center gap-3 p-3">
      <Link to={`/students/${s.studentId}`} className="flex min-w-0 flex-1 basis-60 items-center gap-3">
        {s.photoUrl ? (
          <img src={s.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 font-extrabold text-slate-600">{s.name.slice(0, 1)}</span>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate font-bold">
            {s.name} <ChevronRight size={14} className="shrink-0 text-slate-300" />
          </p>
          <p className="truncate text-xs text-slate-500">
            {[s.username && `@${s.username}`, s.phone, `kirdi ${fmtShortDateTime(s.createdAt)}`].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            {!s.nameConfirmed && <Badge tone="amber">ismini hali yozmagan</Badge>}
            {s.parentStatus === "APPROVED" ? <Badge tone="green">ota-ona ✓</Badge> : s.parentStatus === "PENDING" ? <Badge tone="blue">ota-ona kutilmoqda</Badge> : <Badge>ota-ona yo'q</Badge>}
            <span className="inline-flex items-center gap-0.5"><BookOpen size={11} /> {act.lessons}</span>
            <span className="inline-flex items-center gap-0.5"><ClipboardList size={11} /> {act.tests}</span>
            <span className="inline-flex items-center gap-0.5"><FileText size={11} /> {act.essays}</span>
          </p>
        </div>
      </Link>
      {s.matches.length > 0 && (
        <div className="basis-full rounded-xl bg-emerald-50 p-2">
          <p className="mb-1 text-xs font-bold text-emerald-800">Ro'yxatingizdagi shu o'quvchi bo'lishi mumkin:</p>
          <div className="flex flex-wrap gap-2">
            {s.matches.map((m) => {
              const who = `${m.name}${m.groupName ? ` · ${m.groupName}` : ""}`;
              return isTeacher ? (
                <ConfirmButton key={m.studentId} label={`${m.name} bilan birlashtirilsinmi?`} className="btn-secondary btn-sm h-9" onConfirm={() => link.mutate(m.studentId)}>
                  <Link2 size={14} /> {who}
                </ConfirmButton>
              ) : (
                <Badge key={m.studentId}>{who}</Badge>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {groups.length > 0 && (
          <div className="flex">
            <select className="input h-9 rounded-r-none border-r-0 py-0 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Guruh">
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button className="btn-primary btn-sm h-9 rounded-l-none" disabled={busy || !groupId} onClick={() => accept.mutate(groupId)}>
              <UserCheck size={14} /> Guruhga
            </button>
          </div>
        )}
        <button className="btn-secondary btn-sm h-9" disabled={busy} onClick={() => accept.mutate(null)}>
          Online o'quvchi
        </button>
        {isTeacher && (
          <>
            <ConfirmButton label="Bloklansinmi?" className="btn-ghost btn-sm h-9 text-slate-600" onConfirm={() => block.mutate()}>
              <Ban size={14} /> Bloklash
            </ConfirmButton>
            <ConfirmButton label="Korzinkaga o'tsinmi?" className="btn-ghost btn-sm h-9 text-red-600" onConfirm={() => del.mutate()}>
              <Trash2 size={14} /> O'chirish
            </ConfirmButton>
          </>
        )}
      </div>
    </div>
  );
}

function Duplicate({ r }: { r: DuplicateRow }) {
  const toast = useToast();
  const qc = useQueryClient();
  const link = useMutation({
    mutationFn: () => api.linkStudent(r.student.id, r.placeholder.id),
    onSuccess: (res) => {
      toast(`${res.name}: yozuvlar birlashtirildi`);
      for (const k of ["duplicates", "newcomers", "roster", "groups", "dashboard"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const s = r.student;
  const ph = r.placeholder;
  // Birlashtirilganda qo'lda kiritilgan yozuvning guruhi ustun (ustoz o'zi yozgan)
  const moves = ph.groupName && s.groupName && ph.groupName !== s.groupName;
  return (
    <div className="card flex flex-wrap items-center gap-3 p-3">
      <Link to={`/students/${s.id}`} className="min-w-0 flex-1 basis-56">
        <p className="truncate font-bold">{s.name}</p>
        <p className="truncate text-xs text-slate-500">{[s.username && `@${s.username}`, s.phone, s.groupName ?? "guruhsiz"].filter(Boolean).join(" · ")}</p>
        <p className="mt-0.5 text-[11px]">{s.parentStatus === "APPROVED" ? <Badge tone="green">ota-ona ✓</Badge> : s.parentStatus === "PENDING" ? <Badge tone="blue">ota-ona kutilmoqda</Badge> : <Badge>ota-ona yo'q</Badge>}</p>
      </Link>
      <ArrowLeftRight size={16} className="shrink-0 text-slate-400" />
      <Link to={`/students/${ph.id}`} className="min-w-0 flex-1 basis-56">
        <p className="truncate font-bold">{ph.name}</p>
        <p className="truncate text-xs text-slate-500">
          {[ph.groupName ?? "guruhsiz", "botga kirmagan", `davomat: ${ph.attendance}`].join(" · ")}
        </p>
        {moves && <p className="mt-0.5 text-[11px] font-semibold text-amber-700">Guruhi boshqa: birlashtirilsa {ph.groupName} guruhiga o'tadi</p>}
      </Link>
      <ConfirmButton label="Bitta odammi? Birlashtirilsinmi?" className="btn-primary btn-sm h-9" onConfirm={() => !link.isPending && link.mutate()}>
        <Link2 size={14} /> Birlashtirish
      </ConfirmButton>
    </div>
  );
}
