import { formatScore, type StudentDetail } from "@onatili/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { StudentAdvisor } from "../StudentAdvisor";
import { CopyField, Section } from "./shared";

export type StudentTab = "overview" | "results" | "attendance" | "billing" | "parents" | "activity" | "settings";
type Tone = "good" | "warn" | "bad" | "none";
const TONE: Record<Tone, string> = { good: "text-emerald-700", warn: "text-amber-700", bad: "text-red-600", none: "text-ink-4" };

/** Umumiy: bir qarashda holat (har kartochka o'z bo'limini ochadi) va yo'nalish/tavsiyalar */
export function StudentOverview({ s, open }: { s: StudentDetail; open: (t: StudentTab) => void }) {
  return (
    <div className="space-y-4">
      {!s.telegramLinked && <ConnectCard s={s} />}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles(s).map((t) => (
          <button key={t.label} className="card tap p-3 text-left transition hover:border-brand" onClick={() => open(t.tab)}>
            <p className="flex items-center justify-between text-xs font-bold text-ink-3">
              {t.label} <ChevronRight size={14} className="text-ink-4" />
            </p>
            <p className={`mt-1 text-xl font-extrabold tabular-nums ${TONE[t.tone]}`}>{t.value}</p>
            <p className="truncate text-[11px] text-ink-3" title={t.hint}>
              {t.hint}
            </p>
          </button>
        ))}
      </div>
      <Section title="Yo'nalish va tavsiyalar" hint="Kuchli va zaif tomonlari natijalaridan hisoblanadi">
        <StudentAdvisor id={s.studentId} />
      </Section>
    </div>
  );
}

function tiles(s: StudentDetail): { label: string; value: string; hint: string; tone: Tone; tab: StudentTab }[] {
  const a = s.attendance30;
  const ext = s.externalResults[0];
  const avg = s.stats.averagePercent;
  const out: ReturnType<typeof tiles> = [
    a.total
      ? {
          label: "Davomat (30 kun)",
          value: `${Math.round((a.present / a.total) * 100)}%`,
          hint: a.absent ? `${a.absent} marta kelmagan` : "Hammasiga kelgan",
          tone: a.absent >= 3 ? "bad" : a.absent ? "warn" : "good",
          tab: "attendance",
        }
      : { label: "Davomat (30 kun)", value: "—", hint: "Belgilanmagan", tone: "none", tab: "attendance" },
    ext
      ? {
          label: "Oxirgi mock",
          value: ext.scaledScore != null ? `${formatScore(ext.scaledScore)} ball` : `${formatScore(ext.percent)}%`,
          hint: `${ext.grade ? `${ext.grade} · ` : ""}${ext.title}`,
          tone: ext.percent >= 60 ? "good" : ext.percent >= 40 ? "warn" : "bad",
          tab: "results",
        }
      : {
          label: "Ilovadagi testlar",
          value: avg != null ? `${avg}%` : "—",
          hint: `${s.stats.testsTaken} ta test, ${s.stats.lessonsCompleted} ta dars`,
          tone: avg == null ? "none" : avg >= 70 ? "good" : avg >= 50 ? "warn" : "bad",
          tab: "results",
        },
  ];
  if (s.billing) out.push(billingTile(s));
  const p = s.parents;
  out.push({
    label: "Ota-ona",
    value: p.approved ? `${p.approved} ta` : "Yo'q",
    hint: p.pending ? `${p.pending} ta tasdiq kutmoqda` : p.approved ? "Xabarlar boradi" : "Havolani yuboring",
    tone: p.pending ? "warn" : p.approved ? "good" : "bad",
    tab: "parents",
  });
  return out;
}

function billingTile(s: StudentDetail): ReturnType<typeof tiles>[number] {
  if (s.group) {
    if (!s.startedOn) return { label: "To'lov", value: "Sana yo'q", hint: "Boshlagan sanani kiriting", tone: "warn", tab: "settings" };
    return s.paidThisMonth
      ? { label: "To'lov", value: "To'langan", hint: "Joriy davr", tone: "good", tab: "billing" }
      : { label: "To'lov", value: "To'lanmagan", hint: "Joriy davr", tone: "bad", tab: "billing" };
  }
  const ends = s.subscriptionEndsAt;
  if (ends && new Date(ends) > new Date()) return { label: "Obuna", value: "Faol", hint: `${fmtDate(ends)} gacha`, tone: "good", tab: "billing" };
  return { label: "Obuna", value: "Yo'q", hint: ends ? `${fmtDate(ends)} da tugagan` : "Online obuna olmagan", tone: "none", tab: "billing" };
}

function ConnectCard({ s }: { s: StudentDetail }) {
  const qc = useQueryClient();
  const reset = useMutation({
    mutationFn: () => api.resetStudentInvite(s.studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student", s.studentId] }),
  });
  return (
    <div className="card border-amber-300 bg-amber-50 p-4 sm:p-5">
      <p className="font-bold">O'quvchi hali botga kirmagan</p>
      <p className="mt-1 text-sm text-ink-2">
        Davomat va to'lovlarni hozirdan belgilayverishingiz mumkin. Ilovadan foydalanishi uchun u botga kirib <b>telefon raqamini ulashsa</b> (
        {s.phone ?? "raqam kiritilmagan"}) yoki quyidagi <b>shaxsiy havolani</b> bossa, hisobi shu yozuvga avtomatik bog'lanadi.
      </p>
      {s.inviteUrl ? (
        <div className="mt-3">
          <CopyField value={s.inviteUrl} />
        </div>
      ) : (
        <button className="btn-secondary btn-sm mt-3" onClick={() => reset.mutate()}>
          Shaxsiy havola yaratish
        </button>
      )}
    </div>
  );
}
