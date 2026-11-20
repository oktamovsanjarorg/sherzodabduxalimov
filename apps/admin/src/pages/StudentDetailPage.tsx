import type { StudentDetail } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Phone } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { StudentBilling } from "../components/student/Billing";
import { StudentOverview, type StudentTab } from "../components/student/Overview";
import { StudentParents } from "../components/student/Parents";
import { StudentActivity, StudentAttendance, StudentResults } from "../components/student/Records";
import { StudentSettings } from "../components/student/Settings";
import { Badge, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";

/**
 * O'quvchi sahifasi: tepada kimligi, ostida bo'limlar (tab). Hamma narsa bitta uzun sahifada bo'lganda
 * kerakli joyni topish qiyin edi; bo'lim URL'da (?tab=), orqaga qaytganda o'sha bo'lim ochiladi.
 */
export function StudentDetailPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ["student", id], queryFn: () => api.student(id) });
  if (q.isPending) return <Spinner className="text-ink-4" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  const s = q.data;
  const tabs = tabsOf(s);
  const tab = tabs.find((t) => t.id === params.get("tab"))?.id ?? "overview";
  const open = (t: StudentTab) => {
    setParams(t === "overview" ? {} : { tab: t }, { replace: true });
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to={s.group ? `/students?group=${s.group.id}` : "/students"} className="tap inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> O'quvchilar
      </Link>
      <Header s={s} />
      <Tabs tabs={tabs} tab={tab} open={open} />
      {tab === "overview" && <StudentOverview s={s} open={open} />}
      {tab === "results" && <StudentResults s={s} />}
      {tab === "attendance" && <StudentAttendance s={s} />}
      {tab === "billing" && s.billing && <StudentBilling s={s} />}
      {tab === "parents" && <StudentParents s={s} />}
      {tab === "activity" && <StudentActivity s={s} />}
      {tab === "settings" && <StudentSettings s={s} />}
    </div>
  );
}

type Tab = { id: StudentTab; label: string; alert?: boolean };

function Tabs({ tabs, tab, open }: { tabs: Tab[]; tab: StudentTab; open: (t: StudentTab) => void }) {
  const nav = useRef<HTMLElement>(null);
  // Telefonda tablar yonga suriladi: tanlangani ko'rinib tursin (faqat gorizontal, sahifa sakramaydi)
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav.current && el) nav.current.scrollLeft = Math.max(0, el.offsetLeft - 16);
  }, [tab]);
  return (
    <nav ref={nav} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="O'quvchi bo'limlari">
      <div className="flex w-max gap-1 rounded-xl bg-surface-3 p-1 sm:w-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => open(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`tap relative whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-bold transition ${tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
          >
            {t.label}
            {t.alert && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" aria-label="diqqat talab qiladi" />}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Bo'limlar; qizil nuqta — shu bo'limda qiladigan ish bor */
function tabsOf(s: StudentDetail): Tab[] {
  const unpaid = !!s.billing && !!s.group && s.paidThisMonth === false;
  return [
    { id: "overview", label: "Umumiy" },
    { id: "results", label: "Natijalar" },
    { id: "attendance", label: "Davomat", alert: s.attendance30.absent >= 3 },
    ...(s.billing ? [{ id: "billing" as const, label: "To'lov", alert: unpaid }] : []),
    { id: "parents", label: "Ota-ona", alert: s.parents.pending > 0 },
    { id: "activity", label: "Faollik" },
    { id: "settings", label: "Sozlamalar", alert: !!s.group && !s.startedOn },
  ];
}

function Header({ s }: { s: StudentDetail }) {
  return (
    <div className="card flex items-center gap-4 p-4 sm:p-5">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">{s.name[0]}</span>
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-xl font-extrabold">{s.name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
          <span className="font-semibold text-ink-2">{s.group ? s.group.name : "Online (guruhsiz)"}</span>
          {s.phone ? (
            <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand">
              <Phone size={14} /> {s.phone}
            </a>
          ) : (
            <span>telefon yo'q</span>
          )}
          {s.username && <span>@{s.username}</span>}
        </p>
        <p className="mt-1.5 flex flex-wrap gap-1.5">
          {s.telegramLinked ? <Badge tone="green">botda</Badge> : <Badge tone="amber">botga kirmagan</Badge>}
          {s.blocked && <Badge tone="red">bloklangan</Badge>}
          {s.accessMode === "FREE" && <Badge tone="blue">bepul ochiq</Badge>}
          {s.accessMode === "CLOSED" && <Badge tone="red">kirish yopiq</Badge>}
          {!s.hasAccess && s.accessMode === "AUTO" && <Badge>darslar yopiq</Badge>}
        </p>
      </div>
    </div>
  );
}
