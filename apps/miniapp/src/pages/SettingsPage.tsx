import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, MessageCircle, Moon, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { api } from "../lib/api";
import { useBackButton } from "../lib/hooks";
import { openExternal, requestOwnPhone, tg } from "../lib/telegram";
import { useAuth } from "../store/auth";

export function SettingsPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/profile"));
  const qc = useQueryClient();
  const { user, token, setSession } = useAuth();
  const parents = useQuery({ queryKey: ["my-parents"], queryFn: api.myParents });
  const botUrl = parents.data?.inviteUrl.replace(/\?start=.*$/, "") ?? null;

  const updatePhone = async () => {
    if (!botUrl) return;
    await requestOwnPhone(`${botUrl}?start=phone`);
    // Bot raqamni saqlagach, profilni yangilaymiz
    setTimeout(async () => {
      const me = await api.me().catch(() => null);
      if (me && token) setSession(token, me);
      qc.invalidateQueries({ queryKey: ["me-poll"] });
    }, 3000);
  };

  return (
    <FullPage>
      <h1 className="mb-4 px-1 text-xl font-extrabold">Sozlamalar</h1>

      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-hint">Hisob</h2>
      <div className="card divide-y divide-hint/10 py-1">
        <Row label="Ism" value={[user?.firstName, user?.lastName].filter(Boolean).join(" ")} />
        <Row label="Telegram" value={user?.username ? `@${user.username}` : "—"} />
        <div className="flex items-center gap-3 py-3">
          <Phone size={18} className="text-brand" />
          <span className="flex-1">
            <span className="block text-xs text-hint">Telefon</span>
            <span className="block text-sm font-semibold">{user?.phone ?? "Ulanmagan"}</span>
          </span>
          <button className="btn-ghost h-9 w-auto px-3 text-xs" disabled={!botUrl} onClick={updatePhone}>
            {user?.phone ? "Yangilash" : "Ulash"}
          </button>
        </div>
      </div>
      <p className="mt-2 px-1 text-xs text-hint">Ism va rasm Telegram profilingizdan olinadi: ularni Telegram sozlamalarida o'zgartiring.</p>

      <h2 className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-wide text-hint">Ko'rinish</h2>
      <div className="card flex items-center gap-3">
        <Moon size={18} className="text-brand" />
        <span className="flex-1 text-sm">
          <span className="block font-semibold">Mavzu (kunduzgi / tungi)</span>
          <span className="block text-xs text-hint">Telegram mavzusiga moslashadi{tg?.colorScheme ? `: hozir ${tg.colorScheme === "dark" ? "tungi" : "kunduzgi"}` : ""}</span>
        </span>
      </div>

      <h2 className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-wide text-hint">Yordam</h2>
      <div className="card divide-y divide-hint/10 py-1">
        <button className="tap flex w-full items-center gap-3 py-3 text-left" disabled={!botUrl} onClick={() => botUrl && openExternal(botUrl)}>
          <MessageCircle size={18} className="text-brand" />
          <span className="flex-1 text-sm font-semibold">Botga o'tish</span>
        </button>
        <div className="flex items-start gap-3 py-3">
          <HelpCircle size={18} className="mt-0.5 text-brand" />
          <span className="flex-1 text-sm text-hint">Savol yoki muammo bo'lsa, ustozning yordamchisiga yozing yoki botga /help yuboring.</span>
        </div>
      </div>
    </FullPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm text-hint">{label}</span>
      <span className="truncate text-sm font-semibold">{value}</span>
    </div>
  );
}
