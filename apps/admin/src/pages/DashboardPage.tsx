import { dayLabel } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Film,
  LibraryBig,
  Plus,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AdviceList } from "../components/Advisor";
import { Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useDismissed } from "../lib/dismiss";
import { loadSession } from "../lib/session";

export function DashboardPage() {
  const d = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 30_000 });
  const dismissed = useDismissed();
  const name = loadSession()?.user.firstName ?? "";
  const isTeacher = loadSession()?.user.role === "TEACHER";

  if (d.isPending) return <Spinner className="text-ink-4" />;
  if (d.isError) return <p className="text-sm text-red-600">{errMsg(d.error)}</p>;
  const x = d.data;
  const unmarked = x.attendanceToday.groups.filter((g) => g.total > 0 && g.marked < g.total);
  const payments = isTeacher ? x.pendingPayments : 0;
  const expiring = isTeacher ? x.expiringSubscriptions : 0;
  // Kalit + son: son oshsa yashirilgan xabar qaytadi (lib/dismiss)
  const items: TodoItem[] = [
    payments > 0 && {
      key: "payments",
      count: payments,
      to: "/payments",
      tone: "amber",
      Icon: CreditCard,
      title: `${payments} ta to'lov cheki kutmoqda`,
      hint: "Pul kartaga tushganini tekshirib tasdiqlang",
    },
    expiring > 0 && {
      key: "expiring",
      count: expiring,
      to: "/payments?tab=SUBS",
      tone: "brand",
      Icon: CreditCard,
      title: `${expiring} ta online obuna 7 kun ichida tugaydi`,
      hint: "Bot o'quvchilarga o'zi eslatadi. Ro'yxatni ko'rish",
    },
    x.pendingEssays > 0 && {
      key: "essays",
      count: x.pendingEssays,
      to: x.pendingEssaysBy.hw ? "/essays?tab=hw" : "/essays?tab=mock",
      tone: "amber",
      Icon: FileText,
      title: `${x.pendingEssays} ta esse tekshirilmagan`,
      hint: "O'quvchilar yakuniy natijani kutmoqda",
    },
    x.newStudents > 0 && {
      key: "newStudents",
      count: x.newStudents,
      to: "/students",
      tone: "amber",
      Icon: UserPlus,
      title: `Botga ${x.newStudents} ta yangi o'quvchi kirdi`,
      hint: "O'quvchingizmi? Guruhiga qo'shing, begona bo'lsa — bloklang",
    },
    x.pendingParents > 0 && {
      key: "parents",
      count: x.pendingParents,
      to: "/students",
      tone: "amber",
      Icon: ShieldCheck,
      title: `${x.pendingParents} ta ota-ona so'rovi kutmoqda`,
      hint: "Raqamga qo'ng'iroq qilib tasdiqlang",
    },
    ...unmarked.map((g): TodoItem => ({
      key: `today:${g.id}:${x.attendanceToday.date}`,
      count: 1,
      to: `/attendance?group=${g.id}`,
      tone: "brand",
      Icon: CalendarCheck,
      title: `${g.name} · bugungi dars (${dayLabel(x.attendanceToday.date)}): davomat olinmagan`,
      hint: `${g.marked}/${g.total} o'quvchi belgilangan${g.schedule ? ` · jadval: ${g.schedule}` : ""}`,
    })),
    ...x.attendanceMissed.map((m): TodoItem => ({
      key: `missed:${m.groupId}:${m.date}`,
      count: 1,
      to: `/attendance?group=${m.groupId}&date=${m.date}`,
      tone: "amber",
      Icon: CalendarCheck,
      title: `${m.name} · ${dayLabel(m.date)} darsi: davomat olinmay qolgan`,
      hint: "Jadval bo'yicha dars kuni edi. Dars bo'lmagan bo'lsa — «Yashirish»",
    })),
    x.videos.failed > 0 && {
      key: "videosFailed",
      count: x.videos.failed,
      to: "/content",
      tone: "red",
      Icon: AlertTriangle,
      title: `${x.videos.failed} ta videoni tayyorlab bo'lmadi`,
      hint: "Dars sahifasida «Qayta urinish»ni bosing",
    },
    x.videos.processing > 0 && {
      key: "videosProcessing",
      count: x.videos.processing,
      to: "/content",
      tone: "gray",
      Icon: Film,
      title: `${x.videos.processing} ta video tayyorlanmoqda`,
      hint: "Tayyor bo'lgach o'quvchilarga ko'rinadi",
    },
  ].filter((i): i is TodoItem => !!i);
  const visible = items.filter((i) => !dismissed.hidden(i.key, i.count));
  const hiddenItems = items.filter((i) => dismissed.hidden(i.key, i.count));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold">Assalomu alaykum</p>
        <h1 className="mt-1 text-[2rem] leading-none">{name}</h1>
      </div>

      {/* Bugun nima qilish kerak */}
      <section className="space-y-2">
        <h2 className="label">Bugun</h2>
        {visible.slice(0, 8).map((i) => (
          <Todo key={i.key} i={i} onHide={() => dismissed.hide(i.key, i.count)} />
        ))}
        {visible.length === 0 && (
          <div className="card flex items-center gap-3 p-4 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={20} /> Hammasi joyida, kutayotgan ish yo'q
          </div>
        )}
        {hiddenItems.length > 0 && (
          <button
            className="tap text-xs font-semibold text-ink-3 hover:text-ink hover:underline"
            onClick={() => dismissed.restore(hiddenItems.map((i) => i.key))}
          >
            Yashirilganlarni ko'rsatish ({hiddenItems.length})
          </button>
        )}
      </section>

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

const TONES = {
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  brand: "border-brand/30 bg-brand-soft/40 text-brand-dark",
  red: "border-red-300 bg-red-50 text-red-800",
  gray: "border-line bg-surface text-ink-2",
};

interface TodoItem {
  key: string;
  count: number;
  to: string;
  tone: keyof typeof TONES;
  Icon: typeof Users;
  title: string;
  hint: string;
}

/** Xabar: bosilsa tegishli sahifaga o'tadi; ✕ — yashirish (yangi ish qo'shilsa qaytadi) */
function Todo({ i, onHide }: { i: TodoItem; onHide: () => void }) {
  return (
    <div className={`flex items-center rounded-2xl border transition hover:shadow-sm ${TONES[i.tone]}`}>
      <Link to={i.to} className="flex min-w-0 flex-1 items-center gap-3 p-4">
        <i.Icon size={22} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{i.title}</span>
          <span className="block text-xs opacity-80">{i.hint}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 opacity-60" />
      </Link>
      <button
        className="tap mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-60 hover:bg-black/5 hover:opacity-100"
        onClick={onHide}
        title="Yashirish"
        aria-label={`Yashirish: ${i.title}`}
      >
        <X size={17} />
      </button>
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
