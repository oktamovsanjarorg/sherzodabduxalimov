import { ESSAY_PROMPT_MAX, ESSAY_REQUIREMENTS, ESSAY_STATUS_LABELS, MAX_ESSAY_PAGES, formatSum, type EssayModeName, type MyEssaySummary, formatScore } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronRight, GraduationCap, Info, Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { PhotoPicker, type PickedPhoto } from "../components/PhotoPicker";
import { api, ApiError } from "../lib/api";
import { formatDate, useBackButton } from "../lib/hooks";
import { compressImage } from "../lib/image";
import { haptic, hapticResult } from "../lib/telegram";

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
          {formatScore(e.score.total)}/{e.score.max}
        </span>
      ) : (
        <ChevronRight size={18} className="text-hint" />
      )}
    </button>
  );
}

/** Yangi esse: kim tekshiradi -> mavzu -> varoq rasmlari (yoki matn) -> yuborish. Hammasi bitta sahifada */
export function NewEssayPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/essays"));
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["essay-config"], queryFn: api.essayConfig });
  const [mode, setMode] = useState<EssayModeName | null>(null);
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  const [typed, setTyped] = useState(false);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const draft = useRef<{ id: string; mode: EssayModeName; uploaded: Set<string> } | null>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const c = cfg.data;
  const aiLeft = c ? c.aiDailyLimit - c.aiUsedToday : 0;
  const aiOk = !!c?.aiEnabled && aiLeft > 0;
  const teacherOk = !!c?.teacherPriceUzs || !!c?.staffPreview;
  // Qo'lyozma o'qish sozlanmagan bo'lsa AI faqat yozilgan matn bilan
  const aiTyped = mode === "AI" && (typed || !c?.aiPhotoEnabled);
  const needPhotos = !!mode && !aiTyped;
  const n = words(text);

  const addPhotos = async (files: File[]) => {
    setErr(null);
    setPreparing(true);
    try {
      const next: PickedPhoto[] = [];
      for (const f of files) {
        const blob = await compressImage(f, 2200, 0.85);
        next.push({ blob, url: URL.createObjectURL(blob) });
      }
      setPhotos((p) => [...p, ...next].slice(0, MAX_ESSAY_PAGES));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  const removePhoto = (i: number) => {
    // Bu rasm avvalgi (uzilgan) urinishda serverga yuklangan bo'lsa: eski qoralama o'chiriladi, keyingi yuborishda yangisi yaratiladi
    const d = draft.current;
    if (d && d.uploaded.has(photos[i].url)) {
      void api.deleteEssay(d.id).catch(() => {});
      draft.current = null;
    }
    setPhotos((p) => p.filter((_, j) => j !== i));
  };

  const send = useMutation({
    mutationFn: async () => {
      setProgress("Yuborilmoqda…");
      // Internet uzilib qayta bosilsa: avval yaratilgan qoralama va yuklangan rasmlar qayta ishlatiladi
      let d = draft.current;
      if (!d || d.mode !== mode || !needPhotos) {
        const e = await api.createEssay({ mode: mode!, prompt: prompt.trim(), text: aiTyped ? text : null });
        if (!needPhotos) return e;
        d = draft.current = { id: e.id, mode: mode!, uploaded: new Set() };
      }
      for (let i = 0; i < photos.length; i++) {
        if (d.uploaded.has(photos[i].url)) continue;
        setProgress(`Rasm yuklanmoqda: ${i + 1}/${photos.length}`);
        await api.addEssayPage(d.id, photos[i].blob);
        d.uploaded.add(photos[i].url);
      }
      return api.finishEssay(d.id);
    },
    onSuccess: (e) => {
      hapticResult("success");
      qc.invalidateQueries({ queryKey: ["essays"] });
      qc.invalidateQueries({ queryKey: ["essay-config"] });
      navigate(`/essays/${e.id}`, { replace: true });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Yuborib bo'lmadi, internetni tekshiring"),
    onSettled: () => setProgress(null),
  });

  const canSend = !!mode && prompt.trim().length >= 3 && (aiTyped ? n >= 30 : photos.length > 0) && !send.isPending && !preparing;

  return (
    <FullPage>
      <h1 className="px-1 text-xl font-extrabold">Yangi esse</h1>
      {cfg.isPending && <div className="skeleton mt-4 h-48" />}
      {c && (
        <>
          <Step n={1} title="Kim tekshirsin?" />
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
              price={c.teacherPriceUzs ? `${formatSum(c.teacherPriceUzs)} so'm` : c.staffPreview ? "Sinov (to'lovsiz)" : "Tez orada"}
              hint="Aniq baho va izoh"
              onClick={() => setMode("TEACHER")}
            />
          </div>

          {mode && (
            <details className="card mt-4 text-sm">
              <summary className="cursor-pointer font-bold text-brand">Esse talablari (rasmiy mezon, 24 ball)</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-hint">
                {ESSAY_REQUIREMENTS.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-hint">
                12 ta band bo'yicha baholanadi: uslub, qarashlar, dalillar, tuzilish, mantiq, imlo, punktuatsiya, qo'shimcha va so'z qo'llash, lug'at boyligi. 100 so'zdan kam yoki mavzuga mos bo'lmasa — 2 ball.
              </p>
            </details>
          )}

          {mode && (
            <>
              <Step n={2} title="Esse mavzusi" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={ESSAY_PROMPT_MAX}
                rows={2}
                placeholder="Masalan: Kitob — bilim manbai. Topshiriq iqtibos bilan bo'lsa, to'liq ko'chiring"
                className="w-full resize-y rounded-xl border-2 border-transparent bg-section px-4 py-3 text-[16px] leading-snug outline-none focus:border-brand"
              />
              {prompt.length > ESSAY_PROMPT_MAX - 150 && (
                <p className="mt-1 px-1 text-xs text-hint">
                  {prompt.length} / {ESSAY_PROMPT_MAX} belgi
                </p>
              )}
            </>
          )}

          {needPhotos && (
            <>
              <Step n={3} title={`Varoq rasmlari (${photos.length}/${MAX_ESSAY_PAGES})`} />
              <PhotoPicker photos={photos} max={MAX_ESSAY_PAGES} busy={preparing} onAdd={addPhotos} onRemove={removePhoto} />
              <p className="mt-2 px-1 text-xs text-hint">Varoqni yorug' joyda, tekis qilib, butun sahifa ko'rinadigan qilib suratga oling.</p>
              {mode === "AI" && c.aiPhotoEnabled && (
                <button className="mt-2 px-1 text-sm font-semibold text-brand" onClick={() => setTyped(true)}>
                  Yoki matnni telefonda yozaman
                </button>
              )}
            </>
          )}

          {aiTyped && (
            <>
              <Step n={3} title="Esse matni" />
              {c.aiPhotoEnabled ? (
                <button className="mb-3 px-1 text-sm font-semibold text-brand" onClick={() => setTyped(false)}>
                  ← Varoqqa yozganman: rasmini yuklayman
                </button>
              ) : (
                <div className="card mb-3 flex gap-3 text-sm">
                  <Info size={20} className="mt-0.5 shrink-0 text-brand" />
                  <p className="text-hint">AI hozircha faqat yozilgan matnni tekshiradi.</p>
                </div>
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Esse matnini shu yerga yozing"
                className="min-h-[45vh] w-full resize-y rounded-card border-2 border-transparent bg-section px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-brand"
              />
              <p className={`mt-1 px-1 text-xs ${n < 30 ? "text-hint" : "text-success"}`}>{n} ta so'z{n < 30 ? " (kamida 30)" : n < 100 ? " · 100 tadan kam bo'lsa mezon bo'yicha 2 ball" : ""}</p>
            </>
          )}

          {err && <p className="mt-3 px-1 text-sm text-danger">{err}</p>}
          {mode && (
            <button className="btn-primary mt-5" disabled={!canSend} onClick={() => send.mutate()}>
              {send.isPending && <Loader2 size={18} className="animate-spin" />}
              {progress ?? (mode === "AI" ? "AI'ga tekshirishga yuborish" : c.staffPreview && !c.teacherPriceUzs ? "Ustozga yuborish" : "Davom etish: to'lov")}
            </button>
          )}
          {mode === "TEACHER" && !c.staffPreview && (
            <p className="mt-2 px-1 text-center text-xs text-hint">Keyingi qadamda to'lov chekini yuborasiz. Tasdiqlangach ustoz tekshiradi, natija bot orqali keladi.</p>
          )}
          {c.staffPreview && <p className="mt-2 px-1 text-center text-xs text-hint">Siz xodimsiz: sinov uchun ustoz tekshiruvi to'lovsiz.</p>}
        </>
      )}
    </FullPage>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <p className="mb-2 mt-6 flex items-center gap-2 px-1 text-sm font-bold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-white">{n}</span>
      {title}
    </p>
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
