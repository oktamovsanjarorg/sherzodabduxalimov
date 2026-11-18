import type { Me } from "@onatili/shared";
import { Check, ChevronRight, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { haptic } from "../lib/telegram";

const LABELS = { LESSON: "Dars", TOPIC_TEST: "Mavzu testi", MOCK: "Mock", ESSAY: "Esse" } as const;

type Step = { title: string; hint: string; state: "done" | "todo" | "wait"; to?: string };

/**
 * Cheklangan rejim: to'liq ochilish uchun 3 qadam. Bosh sahifada asosiy tugma bitta (dars),
 * shuning uchun bu yerda qadamlar katta tugma emas, ro'yxat qatori ko'rinishida.
 */
export function TrialBanner({ user }: { user: Me }) {
  const navigate = useNavigate();
  const { limited, accepted, paid, used } = user.trial;
  if (!limited || user.role !== "STUDENT") return null;

  const steps: Step[] = [
    user.parentStatus === "APPROVED"
      ? { title: "Ota-ona ulandi", hint: "Ustoz tasdiqladi", state: "done" }
      : user.parentStatus === "PENDING"
        ? { title: "Ota-ona ulandi", hint: "Ustoz tekshirmoqda", state: "wait" }
        : { title: "Ota-onangizni ulang", hint: "Havolani ota-onangizga yuboring", state: "todo", to: "/parents" },
    paid
      ? { title: "To'lov qilindi", hint: "Obuna faol", state: "done" }
      : { title: "To'lov qiling", hint: "Kartaga o'tkazib, chekni yuboring", state: "todo", to: "/subscribe" },
    accepted
      ? { title: "Ustoz tasdiqladi", hint: "Hisobingiz tasdiqlangan", state: "done" }
      : { title: "Ustoz tasdig'i", hint: "Ustoz ko'rib chiqadi, sizdan hech narsa kerak emas", state: "wait" },
  ];
  const done = steps.filter((s) => s.state === "done").length;

  return (
    <section className="card mt-4 p-0">
      <div className="px-4 pb-2 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-bold">Hisobni to'liq ochish</p>
          <span className="shrink-0 text-xs font-bold text-hint">{done} / {steps.length}</span>
        </div>
        <p className="mt-0.5 text-xs text-hint">
          Hozircha har bo'limdan bir martadan foydalana olasiz
          {used.length > 0 && <> · ishlatilgan: {used.map((k) => LABELS[k]).join(", ")}</>}
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-hint/15">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ul className="mt-1">
        {steps.map((s) => (
          <li key={s.title} className="border-t border-hint/10">
            <StepRow s={s} onOpen={s.to ? () => (haptic(), navigate(s.to!)) : undefined} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepRow({ s, onOpen }: { s: Step; onOpen?: () => void }) {
  const icon =
    s.state === "done" ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white"><Check size={15} strokeWidth={3} /></span>
    ) : s.state === "wait" ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-hint/15 text-hint"><Clock size={15} /></span>
    ) : (
      <span className="h-7 w-7 rounded-full border-2 border-brand" />
    );
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${s.state === "done" ? "text-hint" : ""}`}>{s.title}</span>
        <span className="block text-xs text-hint">{s.hint}</span>
      </span>
      {onOpen && <ChevronRight size={18} className="shrink-0 text-brand" />}
    </>
  );
  return onOpen ? (
    <button className="tap flex w-full items-center gap-3 px-4 py-3 text-left" onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
  );
}
