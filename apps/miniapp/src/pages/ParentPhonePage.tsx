import { useQuery } from "@tanstack/react-query";
import { Phone, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { SafeTopBar } from "../components/AppLayout";
import { api } from "../lib/api";
import { requestOwnPhone } from "../lib/telegram";
import { useAuth } from "../store/auth";

/** Ota-ona havolasi orqali kelib, ilovani ochgan odam: raqami darhol so'raladi, bot uni ulanishga aylantiradi */
export function ParentPhonePage({ onSkip }: { onSkip: () => void }) {
  const { token, setSession } = useAuth();
  const asked = useRef(false);
  const me = useQuery({ queryKey: ["me-phone"], queryFn: api.me, refetchInterval: 3000 });
  const parents = useQuery({ queryKey: ["my-parents"], queryFn: api.myParents });
  const botPhoneUrl = parents.data?.inviteUrl.replace(/\?start=.*$/, "?start=phone");

  useEffect(() => {
    if (token && me.data && !me.data.pendingParentInvite) setSession(token, me.data);
  }, [me.data, token, setSession]);

  useEffect(() => {
    if (!botPhoneUrl || asked.current) return;
    asked.current = true;
    void requestOwnPhone(botPhoneUrl);
  }, [botPhoneUrl]);

  return (
    <div className="min-h-full">
      <SafeTopBar />
      <main className="mx-auto flex max-w-md flex-col items-center px-4 pb-10 pt-[calc(theme(spacing.safe-top)+24px)] text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <ShieldCheck size={32} />
        </span>
        <h1 className="mt-3 text-xl font-extrabold">Raqamingizni ulashing</h1>
        <p className="mt-1 text-sm text-hint">Farzandingizga ulanish uchun telefon raqamingiz kerak. Ustoz shu raqam orqali tekshirib tasdiqlaydi.</p>
        <button className="btn-primary mt-5" disabled={!botPhoneUrl} onClick={() => botPhoneUrl && void requestOwnPhone(botPhoneUrl)}>
          <Phone size={18} /> Raqamni ulashish
        </button>
        <button className="mt-3 text-sm font-semibold text-hint" onClick={onSkip}>
          Keyinroq
        </button>
      </main>
    </div>
  );
}
