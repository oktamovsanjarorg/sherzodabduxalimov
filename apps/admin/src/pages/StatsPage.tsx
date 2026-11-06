import { formatScore, formatSum, monthLabel, type TeacherStats } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, CalendarCheck, ChevronLeft, ChevronRight, ClipboardList, FileText, Trophy, Users, Wallet, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { loadSession } from "../lib/session";
import { PaymentInsightsView } from "./PaymentInsights";
import { PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";

// Diagramma ranglari (rang ko'rlikka tekshirilgan): 1 — moviy-yashil, 2 — to'q sariq, 3 — binafsha
const S1 = "#0d9488";
const S2 = "#eb6834";
const S3 = "#6250d6";

const thisMonth = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
const shift = (m: string, k: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + k, 1)).toISOString().slice(0, 7);
};
const shortMonth = (m: string) => monthLabel(m).split(" ")[0].toLowerCase();
const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function StatsPage() {
  const [month, setMonth] = useState(thisMonth());
  const [params, setParams] = useSearchParams();
  const isTeacher = loadSession()?.user.role === "TEACHER";
  const tab = isTeacher && params.get("tab") === "pay" ? "pay" : "main";
  const q = useQuery({ queryKey: ["stats", month], queryFn: () => api.stats(month), enabled: tab === "main" });
  const current = month >= thisMonth();

  return (
    <>
      <PageHeader
        title="Statistika"
        subtitle="Oy bo'yicha: o'quvchilar qanday o'qiyapti, kimga e'tibor kerak va qaysi mavzu qiyin."
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button className="btn-ghost btn-sm" aria-label="Oldingi oy" onClick={() => setMonth(shift(month, -1))}>
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[120px] text-center text-sm font-bold capitalize">{monthLabel(month)}</span>
            <button className="btn-ghost btn-sm" aria-label="Keyingi oy" disabled={current} onClick={() => setMonth(shift(month, 1))}>
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />
      {isTeacher && (
        <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
          {(
            [
              ["main", "Umumiy"],
              ["pay", "To'lovlar tahlili"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setParams(k === "pay" ? { tab: "pay" } : {}, { replace: true })} className={`h-9 rounded-md px-3 ${tab === k ? "bg-brand text-white" : "text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      {tab === "pay" ? (
        <PaymentInsightsView month={month} />
      ) : q.isPending ? (
        <Spinner className="text-slate-400" />
      ) : q.isError ? (
        <p className="text-sm text-red-600">{errMsg(q.error)}</p>
      ) : (
        <Body s={q.data} />
      )}
    </>
  );
}

function Body({ s }: { s: TeacherStats }) {
  const a = s.attendance;
  return (
    <div className="space-y-5">
      {/* Asosiy ko'rsatkichlar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi Icon={Users} label="O'quvchilar" value={String(s.students.total)} hint={`${s.students.offline} offline · ${s.students.online} online${s.students.newThisMonth ? ` · +${s.students.newThisMonth} yangi` : ""}`} />
        <Kpi
          Icon={BookOpen}
          label="Faol o'quvchilar"
          value={String(s.students.active)}
          hint={s.students.total ? `${Math.round((s.students.active / s.students.total) * 100)}% — dars ko'rgan, test yoki esse topshirgan` : "—"}
        />
        <Kpi Icon={CalendarCheck} label="Davomat" value={a.rate === null ? "—" : `${a.rate}%`} hint={a.rate === null ? "Bu oy davomat olinmagan" : `${a.lessons} ta dars · ${a.absent} marta kelmagan`} />
        <Kpi
          Icon={ClipboardList}
          label="Test natijasi (o'rtacha)"
          value={s.tests.avgPercent === null ? "—" : `${s.tests.avgPercent}%`}
          hint={s.tests.attempts ? `${s.tests.attempts} ta test ishlangan` : "Bu oy test ishlanmagan"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="E'tibor kerak" hint="Ko'p dars qoldirgan, natijasi past yoki uzoq vaqt ilovaga kirmagan o'quvchilar" Icon={AlertTriangle}>
          {s.attention.length === 0 ? (
            <Calm text="Hammasi joyida: e'tibor talab qiladigan o'quvchi yo'q" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.attention.map((x) => (
                <li key={x.userId}>
                  <Link to={`/students/${x.userId}`} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {x.name} {x.group && <span className="font-normal text-slate-500">· {x.group}</span>}
                      </p>
                      <p className="text-xs text-slate-600">{x.reasons.join(" · ")}</p>
                    </div>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Qiyin mavzular" hint="Test javoblarida to'g'ri javoblar ulushi eng past mavzular. Shu mavzularni qayta tushuntirish foydali" Icon={BookOpen}>
          {s.tests.weakTopics.length === 0 ? (
            <Calm text="Hali yetarli ma'lumot yo'q (mavzu bo'yicha kamida 5 ta javob kerak)" />
          ) : (
            <ul className="space-y-3">
              {s.tests.weakTopics.map((t) => (
                <li key={t.topicId}>
                  <Meter label={t.title} value={t.correctPercent} note={`${t.answers} ta javob`} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Guruhlar bo'yicha davomat" hint="Kelgan va kechikkanlar ulushi (belgilangan darslar ichida)" Icon={CalendarCheck}>
          {a.byGroup.length === 0 ? (
            <Calm text="Faol guruh yo'q" />
          ) : (
            <ul className="space-y-3">
              {a.byGroup.map((g) => (
                <li key={g.groupId}>
                  <Meter
                    label={g.name}
                    value={g.rate}
                    note={g.lessons ? `${g.lessons} ta dars · ${g.students} o'quvchi${g.absent ? ` · ${g.absent} marta kelmagan` : ""}` : "bu oy davomat olinmagan"}
                  />
                </li>
              ))}
            </ul>
          )}
          {a.rate !== null && (
            <p className="mt-4 text-xs text-slate-500">
              Jami: {a.present} keldi · {a.late} kechikdi · {a.absent} kelmadi · {a.excused} sababli
            </p>
          )}
        </Card>

        <Card title="Mock natijalari (Milliy sertifikat)" hint="Shu oyda topshirilgan mocklar: umumiy ball (75 dan) va darajalar" Icon={Trophy}>
          {s.mocks.attempts === 0 ? (
            <Calm text="Bu oy mock topshirilmagan" />
          ) : (
            <>
              <p className="mb-3 text-sm">
                <b className="text-2xl font-extrabold">{s.mocks.avgTotal === null ? "—" : formatScore(s.mocks.avgTotal)}</b>
                <span className="text-slate-500"> / 75 o'rtacha · {s.mocks.attempts} ta mock</span>
              </p>
              <Levels levels={s.mocks.levels} />
            </>
          )}
        </Card>

        <Card title="Esselar" hint="Shu oyda yuborilgan va tekshirilgan esselar" Icon={FileText}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Yuborildi" value={s.essays.submitted} />
            <Mini label="Ustoz tekshirdi" value={s.essays.checkedByTeacher} />
            <Mini label="AI tekshirdi" value={s.essays.checkedByAi} />
            <Mini label="O'rtacha ball" value={s.essays.avgScore === null ? "—" : `${formatScore(s.essays.avgScore)}/24`} />
          </div>
          {s.essays.waiting > 0 && (
            <Link to="/essays" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-amber-700 hover:underline">
              <AlertTriangle size={15} /> Hozir {s.essays.waiting} ta esse tekshiruv kutmoqda
            </Link>
          )}
        </Card>

        <Card title="Eng yaxshi natijalar" hint="Shu oyda kamida 2 ta test ishlaganlar, o'rtacha natija bo'yicha" Icon={Trophy}>
          {s.top.length === 0 ? (
            <Calm text="Hali yetarli natija yo'q" />
          ) : (
            <ol className="space-y-2">
              {s.top.map((t, i) => (
                <li key={t.userId}>
                  <Link to={`/students/${t.userId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {t.name} {t.group && <span className="font-normal text-slate-500">· {t.group}</span>}
                    </span>
                    <span className="text-sm font-extrabold">{t.avgPercent}%</span>
                    <span className="w-14 text-right text-xs text-slate-500">{t.tests} test</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="Haftalik faollik" hint="Oxirgi 8 hafta: o'quvchilar ilovada nima qilgan. Ustun ustiga olib boring — aniq son chiqadi" Icon={BookOpen}>
        <Columns
          series={[
            { name: "Ko'rilgan darslar", color: S1 },
            { name: "Ishlangan testlar", color: S2 },
            { name: "Esselar", color: S3 },
          ]}
          data={s.weeks.map((w) => ({ key: w.start, label: ddmm(w.start), title: `${ddmm(w.start)} dan boshlangan hafta`, values: [w.lessons, w.tests, w.essays] }))}
          format={(n) => String(n)}
        />
      </Card>

      {s.income && (
        <Card title="Daromad" hint="Oxirgi 6 oy: online (tasdiqlangan cheklar) va offline guruhlar to'lovi. Faqat sizga ko'rinadi" Icon={Wallet}>
          <Columns
            series={[
              { name: "Online", color: S1 },
              { name: "Offline", color: S2 },
            ]}
            data={s.income.months.map((m) => ({ key: m.month, label: shortMonth(m.month), title: monthLabel(m.month), values: [m.online, m.offline] }))}
            format={(n) => `${formatSum(n)} so'm`}
            total
          />
          <Link to="/stats?tab=pay" className="mt-3 mr-4 inline-flex items-center gap-1 text-sm font-bold text-brand hover:underline">
            To'lovlar tahlili: kim to'lamadi, prognoz, AI xulosa <ChevronRight size={15} />
          </Link>
          {s.income.offlineDebtors > 0 && (
            <Link to="/payments?tab=OFFLINE" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-amber-700 hover:underline">
              <AlertTriangle size={15} /> <span className="capitalize">{monthLabel(s.month)}</span>: {s.income.offlineDebtors} ta offline o'quvchi hali to'lamagan
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------- Bo'laklar ----------------

function Kpi({ Icon, label, value, hint }: { Icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <Icon size={14} /> {label}
      </p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs leading-snug text-slate-500">{hint}</p>
    </div>
  );
}

function Card({ title, hint, Icon, children }: { title: string; hint: string; Icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-extrabold">
        <Icon size={17} className="text-brand" /> {title}
      </h2>
      <p className="mb-4 mt-0.5 text-xs text-slate-500">{hint}</p>
      {children}
    </section>
  );
}

function Calm({ text }: { text: string }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{text}</p>;
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-lg font-extrabold">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

/** Foiz chizig'i. Holat matn bilan ham yoziladi (faqat rangga tayanmaydi) */
function Meter({ label, value, note }: { label: string; value: number | null; note: string }) {
  const state = value === null ? null : value >= 85 ? { t: "yaxshi", c: "text-emerald-700" } : value >= 65 ? { t: "o'rtacha", c: "text-amber-700" } : { t: "past", c: "text-red-700" };
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
        {state && <span className={`text-xs font-bold ${state.c}`}>{state.t}</span>}
        <span className="w-11 text-right font-extrabold">{value === null ? "—" : `${value}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: S1 }} />
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>
    </div>
  );
}

/** Milliy sertifikat darajalari: har bir daraja nechta */
function Levels({ levels }: { levels: TeacherStats["mocks"]["levels"] }) {
  const max = Math.max(1, ...levels.map((l) => l.count));
  return (
    <div className="flex h-36 items-end gap-2">
      {levels.map((l) => (
        <div key={l.code} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${l.code === "—" ? "46 dan kam" : `${l.code} daraja`}: ${l.count} ta`}>
          <span className="text-xs font-bold">{l.count || ""}</span>
          <div className="w-full max-w-[44px] rounded-t" style={{ height: `${(l.count / max) * 100}%`, minHeight: l.count ? 4 : 0, background: S1 }} />
          <span className="text-[11px] font-bold text-slate-600">{l.code === "—" ? "<46" : l.code}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Ustunli diagramma (seriyalar ustma-ust, oralig'ida 2px bo'shliq). Ustun ustiga olib borilsa (yoki bosilsa)
 * yuqoridagi qatorda aniq qiymatlar chiqadi; standart holatda oxirgi ustun ko'rsatiladi.
 */
function Columns({
  series,
  data,
  format,
  total = false,
}: {
  series: { name: string; color: string }[];
  data: { key: string; label: string; title: string; values: number[] }[];
  format: (n: number) => string;
  total?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const sel = hover ?? data.length - 1;
  const sums = data.map((d) => d.values.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...sums);
  const cur = data[sel];
  return (
    <div>
      {/* Qiymatlar qatori (tooltip o'rnida) */}
      <div className="mb-3 flex min-h-[40px] flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="font-bold first-letter:uppercase">{cur?.title}</span>
        {series.map((s, i) => (
          <span key={s.name} className="flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}: <b className="text-slate-900">{format(cur?.values[i] ?? 0)}</b>
          </span>
        ))}
        {total && (
          <span className="text-slate-600">
            Jami: <b className="text-slate-900">{format(sums[sel] ?? 0)}</b>
          </span>
        )}
      </div>
      <div className="flex h-44 items-end gap-2 border-b border-slate-200 sm:gap-4" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button
            key={d.key}
            type="button"
            className={`flex h-full flex-1 flex-col justify-end rounded-t-md px-1 ${i === sel ? "bg-slate-50" : ""}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${d.title}: ${series.map((s, k) => `${s.name} ${format(d.values[k])}`).join(", ")}`}
          >
            <div className="mx-auto flex w-full max-w-[48px] flex-col-reverse gap-[2px]" style={{ height: `${(sums[i] / max) * 100}%` }}>
              {d.values.map((v, k) =>
                v > 0 ? (
                  <div
                    key={k}
                    className={k === d.values.length - 1 || d.values.slice(k + 1).every((x) => x === 0) ? "rounded-t" : ""}
                    style={{ flexGrow: v, flexBasis: 0, minHeight: 3, background: series[k].color }}
                  />
                ) : null,
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-2 sm:gap-4">
        {data.map((d, i) => (
          <span key={d.key} className={`flex-1 truncate text-center text-[11px] ${i === sel ? "font-bold text-slate-900" : "text-slate-500"}`}>
            {d.label}
          </span>
        ))}
      </div>
      {/* Legenda */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
