import { dayLabel } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { FileText, AlertTriangle, BookOpen, CalendarCheck, CheckCircle2, ChevronRight, ClipboardList, CreditCard, Film, LibraryBig, Plus, ShieldCheck, UserPlus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { loadSession } from "../lib/session";

export function DashboardPage() {
  const d = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 30_000 });
  const name = loadSession()?.user.firstName ?? "";
  const isTeacher = loadSession()?.user.role === "TEACHER";

  if (d.isPending) return <Spinner className="text-slate-400" />;
  if (d.isError) return <p className="text-sm text-red-600">{errMsg(d.error)}</p>;
  const x = d.data;
  const unmarked = x.attendanceToday.groups.filter((g) => g.total > 0 && g.marked < g.total);
  const payments = isTeacher ? x.pendingPayments : 0;
  const expiring = isTeacher ? x.expiringSubscriptions : 0;
  const todo = (expiring ? 1 : 0) + (payments ? 1 : 0) + (x.pendingEssays ? 1 : 0) + (x.pendingParents ? 1 : 0) + (x.newStudents ? 1 : 0) + (unmarked.length ? 1 : 0) + (x.attendanceMissed.length ? 1 : 0) + (x.videos.failed ? 1 : 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">Assalomu alaykum</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
      </div>

      {/* Bugun nima qilish kerak */}
      <section className="space-y-2">
        <h2 className="label">Bugun</h2>
        {payments > 0 && (
          <Todo to="/payments" tone="amber" Icon={CreditCard} title={`${payments} ta to'lov cheki kutmoqda`} hint="Pul kartaga tushganini tekshirib tasdiqlang" />
        )}
        {expiring > 0 && (
          <Todo to="/payments?tab=SUBS" tone="brand" Icon={CreditCard} title={`${expiring} ta online obuna 7 kun ichida tugaydi`} hint="Bot o'quvchilarga o'zi eslatadi. Ro'yxatni ko'rish" />
        )}
        {x.pendingEssays > 0 && (
          <Todo to="/essays" tone="amber" Icon={FileText} title={`${x.pendingEssays} ta esse tekshirilmagan`} hint="O'quvchilar yakuniy natijani kutmoqda" />
        )}
        {x.newStudents > 0 && (
          <Todo to="/students" tone="amber" Icon={UserPlus} title={`Botga ${x.newStudents} ta yangi o'quvchi kirdi`} hint="O'quvchingizmi? Guruhiga qo'shing, begona bo'lsa — bloklang" />
        )}
        {x.pendingParents > 0 && (
          <Todo to="/students" tone="amber" Icon={ShieldCheck} title={`${x.pendingParents} ta ota-ona so'rovi kutmoqda`} hint="Raqamga qo'ng'iroq qilib tasdiqlang" />
        )}
        {unmarked.map((g) => (
          <Todo
            key={g.id}
            to={`/attendance?group=${g.id}`}
            tone="brand"
            Icon={CalendarCheck}
            title={`${g.name} · bugungi dars (${dayLabel(x.attendanceToday.date)}): davomat olinmagan`}
            hint={`${g.marked}/${g.total} o'quvchi belgilangan${g.schedule ? ` · jadval: ${g.schedule}` : ""}`}
          />
        ))}
        {x.attendanceMissed.slice(0, 5).map((m) => (
          <Todo
            key={`${m.groupId}-${m.date}`}
            to={`/attendance?group=${m.groupId}&date=${m.date}`}
            tone="amber"
            Icon={CalendarCheck}
            title={`${m.name} · ${dayLabel(m.date)} darsi: davomat olinmay qolgan`}
            hint="Jadval bo'yicha dars kuni edi. Dars bo'lmagan bo'lsa, e'tibor bermang — 7 kundan keyin o'zi yo'qoladi"
          />
        ))}
        {x.videos.failed > 0 && (
          <Todo to="/content" tone="red" Icon={AlertTriangle} title={`${x.videos.failed} ta videoni tayyorlab bo'lmadi`} hint="Dars sahifasida «Qayta urinish»ni bosing" />
        )}
        {x.videos.processing > 0 && (
          <Todo to="/content" tone="gray" Icon={Film} title={`${x.videos.processing} ta video tayyorlanmoqda`} hint="Tayyor bo'lgach o'quvchilarga ko'rinadi" />
        )}
        {todo === 0 && (
          <div className="card flex items-center gap-3 p-4 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={20} /> Hammasi joyida, kutayotgan ish yo'q
          </div>
        )}
      </section>

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
          <Stat Icon={Users} value={x.students.total} label="O'quvchi" hint={x.students.withoutApprovedParent ? `${x.students.withoutApprovedParent} tasida ota-ona tasdiqlanmagan` : "Hammasida ota-ona tasdiqlangan"} />
          <Stat Icon={BookOpen} value={x.content.lessonsPublished} label="Nashr qilingan dars" hint={x.content.lessonsDraft ? `${x.content.lessonsDraft} ta qoralama` : undefined} />
          <Stat Icon={ClipboardList} value={x.content.tests} label="Test" />
          <Stat Icon={LibraryBig} value={x.content.questions} label="Savol" />
        </div>
      </section>
    </div>
  );
}

const TONES = {
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  brand: "border-brand/30 bg-brand-soft/40 text-brand-dark",
  red: "border-red-300 bg-red-50 text-red-800",
  gray: "border-slate-200 bg-white text-slate-700",
};

function Todo({ to, tone, Icon, title, hint }: { to: string; tone: keyof typeof TONES; Icon: typeof Users; title: string; hint: string }) {
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-2xl border p-4 transition hover:shadow-sm ${TONES[tone]}`}>
      <Icon size={22} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-xs opacity-80">{hint}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 opacity-60" />
    </Link>
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
      <Icon size={18} className="text-slate-400" />
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
