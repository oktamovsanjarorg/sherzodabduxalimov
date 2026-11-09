import { studentNameInput } from "@onatili/shared";
import { useMutation } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useState } from "react";
import { SafeTopBar } from "../components/AppLayout";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

const field = "h-12 w-full rounded-xl border-2 border-transparent bg-section px-4 text-[16px] outline-none focus:border-brand";

/** Ustoz o'quvchini taniy olishi uchun: Telegram'dagi ism o'rniga haqiqiy ism-familiya bir marta so'raladi */
export function StudentNamePage() {
  const { token, setSession } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isParent, setIsParent] = useState(false);
  const save = useMutation({
    mutationFn: api.setMyName,
    onSuccess: (me) => token && setSession(token, me),
    onError: (e: Error) => setError(e.message),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = studentNameInput.safeParse({ firstName, lastName });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Ism-familiyani tekshiring");
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <div className="min-h-full">
      <SafeTopBar />
      <main className="mx-auto flex max-w-md flex-col items-center px-4 pb-10 pt-[calc(theme(spacing.safe-top)+24px)] text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <UserRound size={32} />
        </span>
        <h1 className="mt-3 text-xl font-extrabold">Ism-familiyangizni yozing</h1>
        <p className="mt-1 text-sm text-hint">Ustoz sizni tanishi uchun hujjatdagidek to'liq yozing. Keyin uni faqat ustoz o'zgartira oladi.</p>
        <form className="mt-5 w-full space-y-3" onSubmit={submit}>
          <input className={field} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} autoComplete="given-name" placeholder="Ism" aria-label="Ism" />
          <input className={field} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} autoComplete="family-name" placeholder="Familiya" aria-label="Familiya" />
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={save.isPending}>
            Davom etish
          </button>
        </form>
        {/* Ota-onalar ham shu sahifaga tushib, farzandining ismini yozib yuborardi: ular uchun alohida yo'l */}
        {isParent ? (
          <p className="mt-5 rounded-xl bg-section p-4 text-left text-sm">
            Ota-onalar farzandining shaxsiy havolasi orqali ulanadi. Farzandingiz ilovada <b>Profil → Ota-onam</b> bo'limidagi havolani sizga yuborsin: siz uni bosib,
            telefon raqamingizni ulashasiz. Bu yerga ism yozmang.
          </p>
        ) : (
          <button type="button" className="mt-5 text-sm font-semibold text-brand" onClick={() => setIsParent(true)}>
            Men ota-onaman
          </button>
        )}
      </main>
    </div>
  );
}
