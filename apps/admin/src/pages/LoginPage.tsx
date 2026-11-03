import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg } from "../lib/api";
import { parseTtl, saveSession } from "../lib/session";

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const once = useRef(false);
  const expired = new URLSearchParams(window.location.search).has("expired");

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
    if (!token) return;
    // Tokenni manzil satridan darhol olib tashlaymiz (tarix, skrinshot)
    history.replaceState(null, "", window.location.pathname);
    setBusy(true);
    api
      .consumeLink(token)
      .then((r) => {
        if (r.user.role !== "TEACHER" && r.user.role !== "ASSISTANT") throw new Error("Ruxsat yo'q");
        saveSession({ token: r.token, user: r.user, expiresAt: Date.now() + parseTtl(r.expiresIn) - 60_000 });
        navigate("/", { replace: true });
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setBusy(false));
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="mx-auto h-14 w-14" />
        <h1 className="mt-4 text-xl font-extrabold">Admin panel</h1>
        {busy ? (
          <p className="mt-3 text-sm text-slate-500">Kirilmoqda…</p>
        ) : (
          <>
            {(error || expired) && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error ?? "Sessiya tugadi. Qayta kiring."}
              </p>
            )}
            <div className="mt-5 space-y-2 text-left text-sm text-slate-600">
              <p className="font-bold text-slate-900">Qanday kiriladi:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Telegramda botni oching</li>
                <li>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-bold">/admin</code> deb yozing
                </li>
                <li>«Admin panelni ochish» tugmasini bosing</li>
              </ol>
              <p className="pt-2 text-xs text-slate-500">Havola 5 daqiqa amal qiladi va faqat bir marta ishlaydi.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
