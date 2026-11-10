import { FOLLOW_UP_LABELS, formatSum, monthLabel, type DebtorRow, type PaymentInsights as Insights } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, Bot, Check, ChevronRight, MessageSquare, Phone, Sparkles, TrendingUp, Wallet, X } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Spinner } from "../components/ui";
import { PayDialog } from "../components/PayDialog";
import { api, errMsg } from "../lib/api";
import { fmtDate, fmtShortDateTime } from "../lib/format";
import { useToast } from "../lib/toast";

const S1 = "#0d9488"; // tushgan
const sum = (n: number) => `${formatSum(n)} so'm`;

/** To'lovlar tahlili: kim to'lashi kerak edi, qancha tushdi, prognoz, kim to'lamayapti va ular bilan ishlash */
export function PaymentInsightsView({ month }: { month: string }) {
  const q = useQuery({ queryKey: ["payment-insights", month], queryFn: () => api.paymentInsights(month) });
  if (q.isPending) return <Spinner className="text-slate-400" />;
  if (q.isError) return <p className="text-sm text-red-600">{errMsg(q.error)}</p>;
  const d = q.data;
  return (
    <div className="space-y-5">
      {d.offline.feeMissing > 0 && <FeeMissing d={d} />}
      <Headline d={d} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Shu oy tushishi kerak"
          value={d.total.expectedUzs || d.total.complete ? sum(d.total.expectedUzs) : "—"}
          hint={d.total.complete ? `Offline ${sum(d.offline.expectedUzs)} · online obuna ${sum(d.online.expectedUzs)}` : `${d.offline.feeMissing} o'quvchi hisobga olinmadi: guruh summasi kiritilmagan`}
        />
        <Kpi
          label="Tushdi"
          value={sum(d.total.collectedUzs)}
          hint={`Offline ${formatSum(d.offline.collectedUzs)} · obuna ${formatSum(d.online.collectedUzs)} · esse ${formatSum(d.essays.collectedUzs)}`}
          strong
        />
        <Kpi
          label="Qolgan qarz"
          value={d.total.complete || debt(d) > 0 ? sum(debt(d)) : "—"}
          hint={`${d.debtors.length} ta o'quvchi to'lamagan${d.total.complete ? "" : " · summasi noma'lumlar qo'shilmagan"}`}
          warn
        />
        <Kpi label="Prognoz: oy oxiriga" value={sum(d.forecast.endOfMonthUzs)} hint={`Keyingi oy kutilmoqda: ${sum(d.forecast.nextMonthExpectedUzs)}`} />
      </div>
      {d.offline.paidNoAmount > 0 && (
        <p className="-mt-2 flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle size={14} className="mt-px shrink-0" /> {d.offline.paidNoAmount} ta to'lov summasi yozilmay belgilangan (0 so'm). O'quvchi sahifasida «Qaytarish» qilib, summa bilan qayta belgilang.
        </p>
      )}
      <p className="-mt-2 text-xs text-slate-500">
        <TrendingUp size={12} className="mr-1 inline" />
        Prognoz qanday hisoblandi: {d.forecast.basis}.
      </p>

      <AiReport month={d.month} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Offline guruhlar" hint="Oylik to'lov: nechtasi to'ladi va qancha tushdi">
          {d.offline.groups.length === 0 ? (
            <Calm text="Faol offline guruh yo'q" />
          ) : (
            <ul className="space-y-4">
              {d.offline.groups.map((g) => (
                <GroupLine key={g.groupId} g={g} month={d.month} />
              ))}
            </ul>
          )}
          {d.offline.feeMissing > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle size={14} className="mt-px shrink-0" /> {d.offline.feeMissing} o'quvchining guruhida oylik summa kiritilmagan — kutilgan tushumga qo'shilmadi.{" "}
              <Link to="/payments?tab=OFFLINE" className="font-bold underline">
                Kiritish
              </Link>
            </p>
          )}
        </Card>
        <Card title="Online obunalar" hint="Shu oyda muddati tugaydigan obunalar: uzaytirildimi?">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Muddati tugaydi" value={d.online.due} />
            <Mini label="Uzaytirdi" value={d.online.renewed} />
            <Mini label="Uzaytirmadi" value={d.online.lapsed} tone={d.online.lapsed ? "text-red-700" : undefined} />
          </div>
          {d.online.pendingReceipts > 0 && (
            <Link to="/payments" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-amber-700 hover:underline">
              <AlertTriangle size={15} /> {d.online.pendingReceipts} ta chek tasdiqlanishini kutmoqda ({sum(d.online.pendingUzs)})
            </Link>
          )}
          <p className="mt-3 text-xs text-slate-500">Shu oy obunalardan tushgan (yangi va uzaytirilgan): {sum(d.online.collectedUzs)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Esse tekshiruvi: {d.essays.count} ta · {sum(d.essays.collectedUzs)}
          </p>
        </Card>
      </div>

      {d.history.some((h) => h.expectedUzs > 0) && (
        <Card title="Oldingi oylar (offline)" hint="Qancha tushishi kerak edi va qancha tushdi. Taxminiy: hozirgi guruh tarkibi va summasi bo'yicha">
          <ul className="space-y-3">
            {d.history.map((h) => (
              <li key={h.month}>
                <Progress label={monthLabel(h.month)} got={h.collectedUzs} of={h.expectedUzs} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`To'lamaganlar (${d.debtors.length})`} hint="Eng uzoq qarzdorlar birinchi. Kim bilan gaplashganingizni yozib boring — keyingi safar ko'rinadi, AI ham hisobga oladi">
        {d.debtors.length === 0 ? (
          <Calm text="Hamma to'lagan 🎉" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.debtors.map((x) => (
              <Debtor key={`${x.kind}-${x.studentId}`} x={x} month={d.month} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const debt = (d: Insights) =>
  Math.max(0, d.offline.expectedUzs - d.offline.collectedUzs) + d.debtors.filter((x) => x.kind === "ONLINE").reduce((s, x) => s + x.amountUzs, 0);

/** Guruhga oylik summa kiritilmagan: hisobotlar to'liq emas. Shu yerning o'zida kiritiladi */
function FeeMissing({ d }: { d: Insights }) {
  const toast = useToast();
  const qc = useQueryClient();
  const missing = d.offline.groups.filter((g) => !g.feeUzs);
  const [vals, setVals] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (groupId: string) => api.setGroupFee(groupId, Number((vals[groupId] ?? "").replace(/\D/g, ""))),
    onSuccess: () => {
      toast("Oylik summa saqlandi");
      qc.invalidateQueries({ queryKey: ["payment-insights"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
      <p className="flex items-center gap-2 font-extrabold text-amber-900">
        <AlertTriangle size={18} /> Oylik to'lov narxi noma'lum
      </p>
      <p className="mt-1 text-sm text-amber-900/80">
        Tariflarda oylik tarif yo'q, shuning uchun {d.offline.feeMissing} ta o'quvchidan qancha pul tushishi kerakligini hisoblab bo'lmayapti.{" "}
        <Link to="/billing" className="font-bold underline">
          Tariflarda oylik tarif yarating
        </Link>{" "}
        (hamma guruhga shu narx olinadi) yoki pastda guruhga alohida narx yozing.
      </p>
      <div className="mt-3 space-y-2">
        {missing.map((g) => (
          <div key={g.groupId} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[160px] text-sm font-bold">
              {g.name} <span className="font-normal text-slate-500">· {g.students} o'quvchi</span>
            </span>
            <input
              className="input h-9 w-40 text-sm"
              inputMode="numeric"
              placeholder="Masalan: 300 000"
              value={vals[g.groupId] ?? ""}
              onChange={(e) => setVals({ ...vals, [g.groupId]: e.target.value })}
            />
            <span className="text-sm text-slate-500">so'm / oy</span>
            <button
              className="btn-primary btn-sm h-9"
              disabled={save.isPending || !Number((vals[g.groupId] ?? "").replace(/\D/g, ""))}
              onClick={() => save.mutate(g.groupId)}
            >
              <Check size={14} /> Saqlash
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Headline({ d }: { d: Insights }) {
  const o = d.offline;
  const parts: ReactNode[] = [];
  if (o.students) parts.push(<Fragment key="o">{o.students} ta offline o'quvchidan <b>{o.paid} tasi</b> to'ladi</Fragment>);
  if (d.online.due) parts.push(<Fragment key="n">{d.online.due} ta online obunadan <b>{d.online.renewed} tasi</b> uzaytirildi</Fragment>);
  const pct = d.total.percent ?? 0;
  const planned = d.total.plannedCollectedUzs;
  const timePct = Math.round((d.day / d.daysInMonth) * 100);
  return (
    <section className="card p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{monthLabel(d.month)}</p>
      <p className="mt-1 text-lg font-extrabold leading-snug sm:text-xl">
        {parts.length ? parts.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && ", "}
            {p}
          </Fragment>
        )) : "Bu oy to'lashi kerak bo'lgan o'quvchi yo'q"}
        .
      </p>
      {d.total.expectedUzs > 0 && (
        <div className="mt-3">
          <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: S1 }} />
            {/* Oyning qancha qismi o'tgani: shu chiziqdan orqada bo'lsa — to'lovlar kechikmoqda */}
            {d.day < d.daysInMonth && <div className="absolute inset-y-0 w-0.5 bg-slate-500" style={{ left: `${timePct}%` }} title={`Oyning ${timePct}% i o'tdi`} />}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {sum(planned)} / {sum(d.total.expectedUzs)} · {pct}% tushdi
            {d.day < d.daysInMonth ? ` · oyning ${timePct}% i o'tdi (kulrang chiziq)` : ""}
          </p>
        </div>
      )}
    </section>
  );
}

function GroupLine({ g, month }: { g: Insights["offline"]["groups"][number]; month: string }) {
  const toast = useToast();
  const remind = useMutation({
    mutationFn: () => api.remindDebtors(g.groupId, month),
    onSuccess: (r) => toast(`Eslatma yuborildi: ${r.students} o'quvchi, ${r.messages} ta xabar`),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const unpaid = g.students - g.paid;
  return (
    <li>
      <Progress label={`${g.name} · ${g.paid}/${g.students} to'ladi`} got={g.collectedUzs} of={g.expectedUzs} />
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500">{g.feeUzs ? `Oylik: ${sum(g.feeUzs)}` : "Oylik summa kiritilmagan"}</span>
        {unpaid > 0 && (
          <button className="tap inline-flex items-center gap-1 font-bold text-brand hover:underline disabled:opacity-50" disabled={remind.isPending} onClick={() => remind.mutate()}>
            <BellRing size={13} /> {unpaid} qarzdorga va ota-onasiga bot orqali eslatish
          </button>
        )}
      </div>
    </li>
  );
}

function Debtor({ x, month }: { x: DebtorRow; month: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<null | "CALL" | "PROMISE" | "REASON">(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payment-insights"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };
  const add = useMutation({
    mutationFn: () => api.addFollowUp({ studentId: x.studentId, month, kind: form!, note: note.trim() || null, promisedAt: form === "PROMISE" ? date : null }),
    onSuccess: () => {
      toast("Yozib qo'yildi");
      setForm(null);
      setNote("");
      setDate("");
      refresh();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const [paying, setPaying] = useState(false);
  const del = useMutation({ mutationFn: (id: string) => api.removeFollowUp(id), onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  const promise = x.followUps.find((f) => f.kind === "PROMISE");
  const promiseLate = promise?.promisedAt && promise.promisedAt < new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <Link to={`/students/${x.studentId}`} className="min-w-0 flex-1 basis-56">
          <p className="flex items-center gap-1 font-bold">
            {x.name} <ChevronRight size={14} className="text-slate-300" />
          </p>
          <p className="text-xs text-slate-500">
            {x.kind === "OFFLINE" ? "Offline" : "Online"}
            {x.where ? ` · ${x.where}` : ""} · {x.amountUzs ? sum(x.amountUzs) : "oylik summa kiritilmagan"}
          </p>
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          {x.overdue.months !== undefined && <Badge tone={x.overdue.months >= 2 ? "red" : "amber"}>{x.overdue.months >= 2 ? `${x.overdue.months} oydan beri to'lamagan` : "shu oy to'lamagan"}</Badge>}
          {x.overdue.days !== undefined && <Badge tone={x.overdue.days > 7 ? "red" : "amber"}>obuna tugaganiga {x.overdue.days} kun</Badge>}
          {x.attended !== null && x.attended > 0 && <Badge tone="blue">darsga {x.attended} marta keldi</Badge>}
          {x.attended === 0 && <Badge>shu oy darsga kelmagan</Badge>}
          {x.idleDays !== null && x.idleDays >= 7 && <Badge>{x.idleDays} kundan beri ilovaga kirmagan</Badge>}
          {x.pendingReceipt && <Badge tone="green">chek yubordi — tasdiqlang</Badge>}
          {promise && <Badge tone={promiseLate ? "red" : "green"}>{promiseLate ? "va'da muddati o'tdi" : `${fmtDate(promise.promisedAt!)} gacha to'laydi`}</Badge>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {x.parent ? (
          <span className="text-slate-600">
            Ota-ona: <b>{x.parent.name}</b>{" "}
            {x.parent.phone && (
              <a href={`tel:${x.parent.phone}`} className="inline-flex items-center gap-0.5 font-bold text-brand">
                <Phone size={12} /> {x.parent.phone}
              </a>
            )}
          </span>
        ) : (
          <span className="text-amber-700">Ota-ona ulanmagan</span>
        )}
        {x.phone && (
          <a href={`tel:${x.phone}`} className="inline-flex items-center gap-0.5 font-bold text-slate-600">
            <Phone size={12} /> o'quvchi {x.phone}
          </a>
        )}
      </div>

      {x.followUps.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
          {x.followUps.map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-xs text-slate-600">
              {f.kind === "BOT" ? <Bot size={13} className="mt-px shrink-0 text-slate-400" /> : <MessageSquare size={13} className="mt-px shrink-0 text-slate-400" />}
              <span className="min-w-0 flex-1">
                <b>{FOLLOW_UP_LABELS[f.kind]}</b>
                {f.promisedAt ? ` (${fmtDate(f.promisedAt)} gacha)` : ""}
                {f.note ? `: ${f.note}` : ""} <span className="text-slate-400">· {fmtShortDateTime(f.createdAt)}{f.by ? ` · ${f.by}` : ""}</span>
              </span>
              {f.kind !== "BOT" && (
                <button className="text-slate-300 hover:text-red-600" aria-label="O'chirish" onClick={() => del.mutate(f.id)}>
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
          <b className="text-xs">{FOLLOW_UP_LABELS[form]}:</b>
          {form === "PROMISE" && <input type="date" className="input h-8 w-40 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />}
          <input
            className="input h-8 min-w-0 flex-1 basis-48 text-sm"
            placeholder={form === "REASON" ? "Masalan: oilaviy qiyinchilik, keyingi oy to'laydi" : form === "CALL" ? "Nima dedi? (ixtiyoriy)" : "Izoh (ixtiyoriy)"}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn-primary btn-sm h-8" disabled={add.isPending || (form === "PROMISE" && !date) || (form === "REASON" && !note.trim())} onClick={() => add.mutate()}>
            <Check size={14} /> Saqlash
          </button>
          <button className="btn-ghost btn-sm h-8" onClick={() => setForm(null)}>
            Yopish
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button className="btn-secondary btn-sm h-8" onClick={() => setForm("CALL")}>
            <Phone size={13} /> Qo'ng'iroq qildim
          </button>
          <button className="btn-secondary btn-sm h-8" onClick={() => setForm("PROMISE")}>
            Va'da berdi
          </button>
          <button className="btn-secondary btn-sm h-8" onClick={() => setForm("REASON")}>
            Sababi
          </button>
          {x.kind === "OFFLINE" && (
            <button className="btn-primary btn-sm h-8" onClick={() => setPaying(true)}>
              <Check size={13} /> To'ladi
            </button>
          )}
          {x.kind === "ONLINE" && (
            <Link to="/payments?tab=SUBS" className="btn-secondary btn-sm h-8">
              Obuna berish
            </Link>
          )}
        </div>
      )}
      {paying && <PayDialog studentId={x.studentId} onClose={() => setPaying(false)} onDone={refresh} />}
    </li>
  );
}

/** AI xulosa: tugma bosilganda tayyorlanadi (ismlar AI'ga yuborilmaydi) */
function AiReport({ month }: { month: string }) {
  const toast = useToast();
  const [report, setReport] = useState<{ text: string; generatedAt: string } | null>(null);
  const gen = useMutation({ mutationFn: () => api.paymentAi(month), onSuccess: setReport, onError: (e) => toast(errMsg(e), "error") });
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex flex-1 items-center gap-2 font-extrabold">
          <Sparkles size={17} className="text-violet-600" /> AI xulosa
        </h2>
        <button className="btn-secondary btn-sm" disabled={gen.isPending} onClick={() => gen.mutate()}>
          {gen.isPending ? <Spinner /> : <Sparkles size={14} />} {report ? "Yangilash" : "Xulosa tayyorlash"}
        </button>
      </div>
      {!report && !gen.isPending && (
        <p className="mt-2 text-sm text-slate-600">
          AI shu oyning raqamlari va qarzdorlar ro'yxatini tahlil qilib, qisqa hisobot beradi: ahvol, prognoz, kim bilan birinchi bog'lanish kerak va nima qilish. O'quvchilarning ismlari AI'ga yuborilmaydi.
        </p>
      )}
      {gen.isPending && <p className="mt-2 text-sm text-slate-500">Tahlil qilinmoqda… (10–30 soniya)</p>}
      {report && (
        <>
          <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-800">{renderReport(report.text)}</div>
          <p className="mt-3 text-[11px] text-slate-400">AI tayyorladi: {fmtShortDateTime(report.generatedAt)} · raqamlarni yuqoridagi jadvallar bilan solishtiring</p>
        </>
      )}
    </section>
  );
}

/** Oddiy markdown: **qalin**, "- " va "1. " ro'yxatlar */
function renderReport(text: string) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      const t = l.trim();
      if (/^[-*•]\s+/.test(t)) return <p key={i} className="pl-4 -indent-3">• {bold(t.replace(/^[-*•]\s+/, ""))}</p>;
      if (/^\d+\.\s/.test(t) || /^\*\*\d+\./.test(t)) return <p key={i} className="pt-2 font-semibold">{bold(t)}</p>;
      return <p key={i}>{bold(t)}</p>;
    });
}

// ---------------- Bo'laklar ----------------

function Kpi({ label, value, hint, strong, warn }: { label: string; value: string; hint: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <Wallet size={13} /> {label}
      </p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${strong ? "text-brand-dark" : warn ? "text-red-700" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="font-extrabold">{title}</h2>
      <p className="mb-4 mt-0.5 text-xs text-slate-500">{hint}</p>
      {children}
    </section>
  );
}

function Calm({ text }: { text: string }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{text}</p>;
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <p className={`text-xl font-extrabold ${tone ?? ""}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function Progress({ label, got, of }: { label: string; got: number; of: number }) {
  const pct = of ? Math.round((got / of) * 100) : null;
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-semibold first-letter:uppercase">{label}</span>
        <span className="text-xs text-slate-500">
          {formatSum(got)} / {of ? formatSum(of) : "—"}
        </span>
        <span className="w-11 text-right font-extrabold">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%`, background: S1 }} />
      </div>
    </div>
  );
}
