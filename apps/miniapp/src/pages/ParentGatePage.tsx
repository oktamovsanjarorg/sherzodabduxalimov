import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Copy, Phone, Send, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { hapticResult, openExternal, requestOwnPhone } from "../lib/telegram";
import { useAuth } from "../store/auth";

/** O'quvchi o'z raqamini va ota-onasini ulaydi. To'liq foydalanish uchun ota-ona va ustoz tasdig'i kerak */
export function ParentGatePage() {
  const { token, user, setSession } = useAuth();
  const [copied, setCopied] = useState(false);
  const [asked, setAsked] = useState(false);
  const hasPhone = Boolean(user?.phone);

  // Bot kontakt va ota-ona so'rovini qabul qilgach, holat o'zgaradi: shuni kuzatib turamiz
  const me = useQuery({ queryKey: ["me-poll"], queryFn: api.me, refetchInterval: 3000 });
  const parents = useQuery({ queryKey: ["my-parents"], queryFn: api.myParents, refetchInterval: hasPhone ? 3000 : false });
  useEffect(() => {
    if (!me.data || !token) return;
    if (me.data.phone !== user?.phone || me.data.parentStatus !== user?.parentStatus || me.data.trial.limited !== user?.trial.limited) {
      if (me.data.parentStatus !== "NONE" && user?.parentStatus === "NONE") hapticResult("success");
      setSession(token, me.data);
    }
  }, [me.data, token, user, setSession]);

  const botPhoneUrl = parents.data ? parents.data.inviteUrl.replace(/\?start=.*$/, "?start=phone") : "";
  const list = parents.data?.parents ?? [];
  const active = list.filter((p) => p.status !== "REJECTED");

  return (
    <div className="mx-auto max-w-md">
      <Step n={1} done={hasPhone} title="Telefon raqamingiz" hint={hasPhone ? user!.phone! : "Telegram'dagi raqamingiz ulashiladi"}>
        {!hasPhone && (
          <button
            className="btn-primary mt-3"
            disabled={!botPhoneUrl}
            onClick={async () => {
              setAsked(true);
              await requestOwnPhone(botPhoneUrl);
            }}
          >
            <Phone size={18} /> Raqamni ulashish
          </button>
        )}
        {!hasPhone && asked && <p className="mt-2 text-xs text-hint">Raqam yuborilgach, bu yer o'zi yangilanadi…</p>}
      </Step>

      <Step
        n={2}
        done={active.length > 0}
        disabled={!hasPhone}
        title="Ota-onangiz"
        hint="Havolani ota-onangizga yuboring. U botda o'z raqamini ulashadi, ustoz tasdiqlaydi."
      >
        {hasPhone && parents.data && (
          <>
            {list.map((p) => (
              <div key={p.id} className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  {p.status === "APPROVED" ? (
                    <CheckCircle2 size={18} className="text-success" />
                  ) : p.status === "PENDING" ? (
                    <Clock size={18} className="text-brand" />
                  ) : (
                    <XCircle size={18} className="text-danger" />
                  )}
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <span className="text-xs text-hint">
                    {p.status === "APPROVED" ? "Tasdiqlangan" : p.status === "PENDING" ? "Tekshirilmoqda" : "Rad etilgan"}
                  </span>
                </div>
                {/* Sabab o'sha rad etilgan ota-onaning o'zi tagida */}
                {p.status === "REJECTED" && p.rejectReason && <p className="mt-1 pl-[26px] text-xs text-danger">Sabab: {p.rejectReason}</p>}
              </div>
            ))}
            {active.length < parents.data.maxParents && (
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" onClick={() => openExternal(parents.data!.shareUrl)}>
                  <Send size={18} /> Ota-onamga yuborish
                </button>
                <button
                  className="btn-ghost w-14 shrink-0 px-0"
                  aria-label="Havolani nusxalash"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(parents.data!.inviteUrl).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                </button>
              </div>
            )}
          </>
        )}
      </Step>

      <p className="mt-4 px-2 text-center text-xs text-hint">Diqqat: havolani o'zingizning boshqa akkauntingizga yuborsangiz, ustoz so'rovni rad etadi.</p>
    </div>
  );
}

function Step({ n, title, hint, done, disabled, children }: { n: number; title: string; hint: string; done: boolean; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`card mb-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${done ? "bg-success text-white" : "bg-brand-soft text-brand"}`}>
          {done ? <CheckCircle2 size={18} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{title}</p>
          <p className="text-xs text-hint">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
