import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarCheck, ChevronRight, ClipboardList, LibraryBig, Plus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AdviceList, useReconcileAdvice } from "../components/Advisor";
import { TodoList } from "../components/TodoList";
import { Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { loadSession } from "../lib/session";
import { todoItems } from "../lib/todo";

export function DashboardPage() {
  const d = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 30_000 });
  const name = loadSession()?.user.firstName ?? "";
  const isTeacher = loadSession()?.user.role === "TEACHER";

  if (d.isPending) return <Spinner className="text-ink-4" />;
  if (d.isError) return <p className="text-sm text-red-600">{errMsg(d.error)}</p>;
  const x = d.data;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold">Assalomu alaykum</p>
        <h1 className="mt-1 text-[2rem] leading-none">{name}</h1>
      </div>

      {/* Bugun nima qilish kerak */}
      <TodoList items={todoItems(x, isTeacher)} />

      {/* Yordamchi: eng muhim tavsiyalar (to'liq ro'yxat /advisor da) */}
      <AdvisorTeaser />

      {/* Tezkor amallar */}
      <section>
        <h2 className="label mb-2">Tezkor amallar</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Quick to="/content" Icon={Plus} label="Dars qo'shish" />
          <Quick to="/questions" Icon={LibraryBig} label="Savollar banki" />
          <Quick to="/tests/new?type=MOCK" Icon={ClipboardList} label="Mock test" />
          <Quick to="/attendance" Icon={CalendarCheck} label="Davomat" />
        </div>
      </section>

      {/* Ko'rsatkichlar */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label">Ko'rsatkichlar</h2>
          <Link to="/stats" className="tap flex items-center gap-1 text-sm font-bold text-brand hover:underline">
            Batafsil statistika <ChevronRight size={15} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            Icon={Users}
            value={x.students.total}
            label="O'quvchi"
            hint={x.students.withoutApprovedParent ? `${x.students.withoutApprovedParent} tasida ota-ona tasdiqlanmagan` : "Hammasida ota-ona tasdiqlangan"}
          />
          <Stat
            Icon={BookOpen}
            value={x.content.lessonsPublished}
            label="Nashr qilingan dars"
            hint={x.content.lessonsDraft ? `${x.content.lessonsDraft} ta qoralama` : undefined}
          />
          <Stat Icon={ClipboardList} value={x.content.tests} label="Test" />
          <Stat Icon={LibraryBig} value={x.content.questions} label="Savol" />
        </div>
      </section>
    </div>
  );
}

function Quick({ to, Icon, label }: { to: string; Icon: typeof Users; label: string }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-4 text-sm font-bold transition hover:border-brand">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon size={18} />
      </span>
      {label}
    </Link>
  );
}

function Stat({ Icon, value, label, hint }: { Icon: typeof Users; value: number; label: string; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <Icon size={18} className="text-ink-4" />
      <p className="mt-2 font-display text-3xl font-medium tabular-nums tracking-tight">{value}</p>
      <p className="text-sm font-semibold text-ink-2">{label}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function AdvisorTeaser() {
  const q = useQuery({ queryKey: ["advisor"], queryFn: api.advisor, staleTime: 5 * 60_000 });
  useReconcileAdvice(q.data?.advice, "platform");
  const top = q.data?.advice.filter((a) => a.level !== "idea") ?? [];
  if (!top.length) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label">Yordamchi tavsiyasi</h2>
        <Link to="/advisor" className="tap flex items-center gap-1 text-sm font-bold text-brand hover:underline">
          Hammasi <ChevronRight size={15} />
        </Link>
      </div>
      <AdviceList items={top} scope="platform" limit={3} />
    </section>
  );
}
