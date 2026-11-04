import { ESSAY_STATUS_LABELS, formatSum, type EssayModeName, type MyEssaySummary } from "@onatili/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Camera, ChevronRight, GraduationCap, Info, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { api, ApiError } from "../lib/api";
import { formatDate, useBackButton } from "../lib/hooks";
import { haptic } from "../lib/telegram";

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const words = (t: string) => (t.trim().match(/\S+/g) ?? []).length;

/** Esselarim: ro'yxat */
export function EssaysPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/"));
  const list = useQuery({
    queryKey: ["essays"],
    queryFn: api.essays,
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === "AI_CHECKING") ? 5000 : false),
  });

  return (
    <FullPage>
      <h1 className="px-1 text-xl font-extrabold">Esselarim</h1>
      <p className="mb-4 px-1 text-sm text-hint">Esse yozing: AI bepul tekshiradi yoki ustozga yuboring</p>
      <button
        className="btn-primary"
        onClick={() => {
          haptic();
          navigate("/essays/new");
        }}
      >
        <Plus size={18} /> Yangi esse
      </button>
      {list.isPending && <div className="skeleton mt-4 h-40" />}
      {list.data?.length === 0 && <p className="card mt-4 text-center text-sm text-hint">Hali esse yubormagansiz</p>}
      <div className="mt-4 space-y-2">
        {list.data?.map((e) => (
          <EssayRow key={e.id} e={e} />
        ))}
      </div>
    </FullPage>
  );
}

function EssayRow({ e }: { e: MyEssaySummary }) {
  const navigate = useNavigate();
  const Icon = e.mode === "AI" ? Bot : GraduationCap;
  const done = e.status === "AI_CHECKED" || e.status === "REVIEWED";
  const action = e.status === "DRAFT" || e.status === "AWAITING_PAYMENT" || e.status === "AI_FAILED";
  return (
    <button onClick={() => navigate(`/essays/${e.id}`)} className="card tap flex w-full items-center gap-3 text-left">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{e.prompt}</span>
        <span className={`block text-xs ${action ? "font-semibold text-danger" : "text-hint"}`}>
          {ESSAY_STATUS_LABELS[e.status]} · {formatDate(e.createdAt)}
        </span>
      </span>
      {e.status === "AI_CHECKING" ? (
        <Loader2 size={18} className="animate-spin text-hint" />
      ) : done && e.score ? (
        <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-extrabold text-brand">
          {fmt(e.score.total)}/{e.score.max}
        </span>
      ) : (
        <ChevronRight size={18} className="text-hint" />
      )}
    </button>
  );
}

/** Yangi esse: kim tekshiradi, mavzu, matn */
export function NewEssayPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/essays"));
  const cfg = useQuery({ queryKey: ["essay-config"], queryFn: api.essayConfig });
  const [mode, setMode] = useState<EssayModeName | null>(null);
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  /** AI: qo'lyozma rasmi (asosiy) yoki matnni yozish */
  const [typed, setTyped] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createEssay({ mode: mode!, prompt: prompt.trim(), text: aiTyped ? text : null }),
    onSuccess: (e) => navigate(`/essays/${e.id}`, { replace: true }),
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Yuborib bo'lmadi, internetni tekshiring"),
  });

  const c = cfg.data;
  const aiLeft = c ? c.aiDailyLimit - c.aiUsedToday : 0;
  const aiOk = !!c?.aiEnabled && aiLeft > 0;
  const teacherOk = !!c?.teacherPriceUzs;
  const n = words(text);
  // Qo'lyozma o'qish sozlanmagan bo'lsa AI faqat yozilgan matn bilan
  const aiTyped = mode === "AI" && (typed || !c?.aiPhotoEnabled);
  const canSend = mode && prompt.trim().length >= 3 && (!aiTyped || n >= 30) && !create.isPending;

  return (
    <FullPage>
      <h1 className="px-1 text-xl font-extrabold">Yangi esse</h1>
      {cfg.isPending && <div className="skeleton mt-4 h-48" />}
      {c && (
        <>
          <p className="mb-2 mt-4 px-1 text-sm font-bold text-hint">1. Kim tekshirsin?</p>
          <div className="grid grid-cols-2 gap-3">
            <ModeCard
              on={mode === "AI"}
              disabled={!aiOk}
              Icon={Bot}
              title="AI"
              price="Bepul"
              hint={!c.aiEnabled ? "Hozircha o'chiq" : aiLeft > 0 ? `Kuniga ${c.aiDailyLimit} ta · yana ${aiLeft} ta` : "Bugungi limit tugadi"}
              onClick={() => setMode("AI")}
            />
            <ModeCard
              on={mode === "TEACHER"}
              disabled={!teacherOk}
              Icon={GraduationCap}
              title="Ustoz"
              price={teacherOk ? `${formatSum(c.teacherPriceUzs!)} so'm` : "Tez orada"}
              hint="Qo'lyozma rasmi"
              onClick={() => setMode("TEACHER")}
            />
          </div>

          {mode && (
            <>
              <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">2. Esse mavzusi</p>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={300}
                placeholder="Masalan: Kitob — bilim manbai"
                className="h-12 w-full rounded-xl border-2 border-transparent bg-section px-4 text-[16px] outline-none focus:border-brand"
              />
            </>
          )}

          {mode === "AI" && !aiTyped && (
            <div className="card mt-4 flex gap-3 text-sm text-hint">
              <Camera size={20} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <p>Esseni varoqqa ruchka bilan yozing. Keyingi qadamda varoq rasmlarini yuklaysiz (1–4 bet): AI qo'lyozmani o'qib, xatolaringiz bilan birga tekshiradi.</p>
                <button className="mt-2 font-semibold text-brand" onClick={() => setTyped(true)}>
                  Yoki matnni telefonda yozaman
                </button>
              </div>
            </div>
          )}

          {aiTyped && (
            <>
              <p className="mb-2 mt-6 px-1 text-sm font-bold text-hint">3. Esse matni</p>
              {c.aiPhotoEnabled ? (
                <button className="mb-3 px-1 text-sm font-semibold text-brand" onClick={() => setTyped(false)}>
                  ← Varoqqa yozganman: rasmini yuklayman
                </button>
              ) : (
                <div className="card mb-3 flex gap-3 text-sm">
                  <Info size={20} className="mt-0.5 shrink-0 text-brand" />
                  <p className="text-hint">AI hozircha faqat yozilgan matnni tekshiradi. Varoqqa yozgan bo'lsangiz, matnni rasmdan nusxalang (iPhone: rasmdagi matnni bosib turib «Nusxalash»; Android: Google Lens → «Matn») va shu yerga qo'ying.</p>
                </div>
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Esse matnini shu yerga yozing"
                className="min-h-[45vh] w-full resize-y rounded-card border-2 border-transparent bg-section px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-brand"
              />
              <p className={`mt-1 px-1 text-xs ${n < 30 ? "text-hint" : "text-success"}`}>{n} ta so'z{n < 30 ? " (kamida 30)" : ""}</p>
            </>
          )}

          {mode === "TEACHER" && (
            <div className="card mt-4 flex gap-3 text-sm text-hint">
              <Camera size={20} className="mt-0.5 shrink-0 text-brand" />
              <p>Keyingi qadamda varoq rasmlarini yuklaysiz (1–4 bet), so'ng to'lov chekini yuborasiz. To'lov tasdiqlangach ustoz tekshiradi va natija bot orqali keladi.</p>
            </div>
          )}

          {err && <p className="mt-3 px-1 text-sm text-danger">{err}</p>}
          {mode && (
            <button className="btn-primary mt-4" disabled={!canSend} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 size={18} className="animate-spin" />}
              {aiTyped ? "AI'ga tekshirishga yuborish" : "Davom etish: varoq rasmlarini yuklash"}
            </button>
          )}
        </>
      )}
    </FullPage>
  );
}

function ModeCard(p: { on: boolean; disabled: boolean; Icon: typeof Bot; title: string; price: string; hint: string; onClick: () => void }) {
  return (
    <button
      disabled={p.disabled}
      onClick={() => {
        haptic();
        p.onClick();
      }}
      className={`card tap flex flex-col items-start gap-1 border-2 text-left disabled:opacity-50 ${p.on ? "border-brand" : "border-transparent"}`}
    >
      <p.Icon size={26} className="text-brand" />
      <span className="mt-1 font-extrabold">{p.title}</span>
      <span className="text-sm font-bold text-brand">{p.price}</span>
      <span className="text-xs text-hint">{p.hint}</span>
    </button>
  );
}
