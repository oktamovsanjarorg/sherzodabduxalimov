import { dayLabel } from "@onatili/shared";
import { AlertTriangle, CalendarCheck, CreditCard, FileText, Film, ShieldCheck, UserPlus, type LucideIcon } from "lucide-react";
import type { AdminDashboard } from "./api";

export interface TodoItem {
  /** Yashirish kaliti: count oshsa yashirilgan xabar qaytadi (lib/dismiss) */
  key: string;
  count: number;
  to: string;
  tone: "amber" | "brand" | "red" | "gray";
  Icon: LucideIcon;
  title: string;
  hint: string;
}

/** Soni bo'lgan xabarlar (davomat xabarlari sana bo'yicha, ularda son yo'q) */
export const todoCounts = (x: AdminDashboard): Record<string, number> => ({
  payments: x.pendingPayments,
  expiring: x.expiringSubscriptions,
  essays: x.pendingEssays,
  newStudents: x.newStudents,
  parents: x.pendingParents,
  videosFailed: x.videos.failed,
  videosProcessing: x.videos.processing,
});
export const COUNT_KEYS = new Set(["payments", "expiring", "essays", "newStudents", "parents", "videosFailed", "videosProcessing"]);

/** «Bugun» ro'yxati, muhimlik tartibida: bugungi dars davomati tepada, o'tgan kunlarniki kutayotgan odamlardan keyin */
export function todoItems(x: AdminDashboard, isTeacher: boolean): TodoItem[] {
  return [...todayAttendance(x), ...waiting(x, isTeacher), ...missedAttendance(x), ...videos(x)];
}

const todayAttendance = (x: AdminDashboard): TodoItem[] =>
  x.attendanceToday.groups
    .filter((g) => g.total > 0 && g.marked < g.total)
    .map((g) => ({
      key: `today:${g.id}:${x.attendanceToday.date}`,
      count: 1,
      to: `/attendance?group=${g.id}`,
      tone: "brand",
      Icon: CalendarCheck,
      title: `${g.name} · bugungi dars (${dayLabel(x.attendanceToday.date)}): davomat olinmagan`,
      hint: `${g.marked}/${g.total} o'quvchi belgilangan${g.schedule ? ` · jadval: ${g.schedule}` : ""}`,
    }));

const missedAttendance = (x: AdminDashboard): TodoItem[] =>
  x.attendanceMissed.map((m) => ({
    key: `missed:${m.groupId}:${m.date}`,
    count: 1,
    to: `/attendance?group=${m.groupId}&date=${m.date}`,
    tone: "amber",
    Icon: CalendarCheck,
    title: `${m.name} · ${dayLabel(m.date)} darsi: davomat olinmay qolgan`,
    hint: "Jadval bo'yicha dars kuni edi. Dars bo'lmagan bo'lsa — «Yashirish»",
  }));

/** Ustozning javobini kutayotganlar. Pulga oidi faqat egaga */
function waiting(x: AdminDashboard, isTeacher: boolean): TodoItem[] {
  const n = todoCounts(x);
  const list: (TodoItem & { teacherOnly?: boolean })[] = [
    {
      key: "payments",
      count: n.payments,
      teacherOnly: true,
      to: "/payments",
      tone: "amber",
      Icon: CreditCard,
      title: `${n.payments} ta to'lov cheki kutmoqda`,
      hint: "Pul kartaga tushganini tekshirib tasdiqlang",
    },
    {
      key: "expiring",
      count: n.expiring,
      teacherOnly: true,
      to: "/payments?tab=SUBS",
      tone: "brand",
      Icon: CreditCard,
      title: `${n.expiring} ta online obuna 7 kun ichida tugaydi`,
      hint: "Bot o'quvchilarga o'zi eslatadi. Ro'yxatni ko'rish",
    },
    {
      key: "essays",
      count: n.essays,
      to: x.pendingEssaysBy.hw ? "/essays?tab=hw" : "/essays?tab=mock",
      tone: "amber",
      Icon: FileText,
      title: `${n.essays} ta esse tekshirilmagan`,
      hint: "O'quvchilar yakuniy natijani kutmoqda",
    },
    {
      key: "newStudents",
      count: n.newStudents,
      to: "/students",
      tone: "amber",
      Icon: UserPlus,
      title: `Botga ${n.newStudents} ta yangi o'quvchi kirdi`,
      hint: "O'quvchingizmi? Guruhiga qo'shing, begona bo'lsa — bloklang",
    },
    {
      key: "parents",
      count: n.parents,
      to: "/students",
      tone: "amber",
      Icon: ShieldCheck,
      title: `${n.parents} ta ota-ona so'rovi kutmoqda`,
      hint: "Raqamga qo'ng'iroq qilib tasdiqlang",
    },
  ];
  return list.filter((i) => i.count > 0 && (isTeacher || !i.teacherOnly));
}

function videos(x: AdminDashboard): TodoItem[] {
  const list: TodoItem[] = [
    {
      key: "videosFailed",
      count: x.videos.failed,
      to: "/content",
      tone: "red",
      Icon: AlertTriangle,
      title: `${x.videos.failed} ta videoni tayyorlab bo'lmadi`,
      hint: "Dars sahifasida «Qayta urinish»ni bosing",
    },
    {
      key: "videosProcessing",
      count: x.videos.processing,
      to: "/content",
      tone: "gray",
      Icon: Film,
      title: `${x.videos.processing} ta video tayyorlanmoqda`,
      hint: "Tayyor bo'lgach o'quvchilarga ko'rinadi",
    },
  ];
  return list.filter((i) => i.count > 0);
}
