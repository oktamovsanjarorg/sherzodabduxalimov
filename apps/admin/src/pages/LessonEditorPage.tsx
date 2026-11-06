import type { AdminLesson } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Film, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmButton, Field, PageHeader, Spinner, Toggle } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatBytes, uploadVideo, type UploadProgress } from "../lib/uploader";

export function LessonEditorPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const lesson = useQuery({
    queryKey: ["lesson", id],
    queryFn: () => api.lesson(id),
    refetchInterval: (q) => (q.state.data?.video?.status === "PROCESSING" ? 3000 : false),
  });

  if (lesson.isPending) return <Spinner className="text-slate-400" />;
  if (lesson.isError) return <p className="text-sm text-red-600">{errMsg(lesson.error)}</p>;
  return <Editor key={lesson.data.id} lesson={lesson.data} onChanged={() => { qc.invalidateQueries({ queryKey: ["lesson", id] }); qc.invalidateQueries({ queryKey: ["courses"] }); }} />;
}

function Editor({ lesson, onChanged }: { lesson: AdminLesson; onChanged: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: lesson.title,
    content: lesson.content ?? "",
    videoUrl: lesson.videoUrl ?? "",
    isFree: lesson.isFree,
    isPublished: lesson.isPublished,
    durationMin: lesson.durationSec ? String(Math.round(lesson.durationSec / 60)) : "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      api.updateLesson(lesson.id, {
        title: f.title,
        content: f.content.trim() || null,
        videoUrl: f.videoUrl.trim() || null,
        isFree: f.isFree,
        isPublished: f.isPublished,
        durationSec: f.durationMin ? Math.round(Number(f.durationMin) * 60) : lesson.video?.durationSec ?? null,
      }),
    onSuccess: () => {
      toast("Dars saqlandi");
      onChanged();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const del = useMutation({
    mutationFn: () => api.deleteLesson(lesson.id),
    onSuccess: () => {
      toast("Dars o'chirildi. Korzinkadan 30 kun ichida tiklash mumkin");
      onChanged();
      navigate("/content");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <>
      <Link to="/content" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Darslar
      </Link>
      <PageHeader
        title={lesson.title}
        actions={
          <>
            <ConfirmButton onConfirm={() => del.mutate()} label="Dars o'chirilsinmi?" className="btn-danger">
              <Trash2 size={16} /> O'chirish
            </ConfirmButton>
            <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Spinner />} Saqlash
            </button>
          </>
        }
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-extrabold">Videodars</h2>
            <VideoSection lesson={lesson} onChanged={onChanged} />
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-500">Yoki tashqi havola (YouTube va h.k.)</summary>
              <div className="mt-2">
                <input className="input" placeholder="https://youtu.be/…" value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">Diqqat: tashqi havola himoyalanmaydi. Yuklangan video bo'lsa, havola ishlatilmaydi.</p>
              </div>
            </details>
          </section>

          <section className="card p-5">
            <h2 className="mb-1 font-extrabold">Konspekt</h2>
            <p className="mb-3 text-xs text-slate-500">
              Formatlash: <code># Sarlavha</code>, <code>- ro'yxat</code>, <code>**qalin**</code>, <code>*kursiv*</code>
            </p>
            <textarea className="textarea min-h-[280px] font-mono text-[13px]" value={f.content} onChange={(e) => set("content", e.target.value)} placeholder="Dars bo'yicha qisqacha konspekt…" />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card space-y-4 p-5">
            <Field label="Dars nomi">
              <input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Davomiyligi (daqiqa)" hint={lesson.video?.durationSec ? "Bo'sh qoldirilsa, video davomiyligi olinadi" : undefined}>
              <input className="input" inputMode="numeric" value={f.durationMin} onChange={(e) => set("durationMin", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Toggle checked={f.isFree} onChange={(v) => set("isFree", v)} label="Bepul dars" hint="Obunasiz o'quvchilar ham ko'radi" />
            <Toggle checked={f.isPublished} onChange={(v) => set("isPublished", v)} label="Nashr qilish" hint="O'quvchilarga ko'rinadi" />
          </section>
          <section className="card p-5 text-sm text-slate-600">
            <p className="mb-2 font-bold text-slate-900">Video himoyasi</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Video shifrlanadi, yuklab olib bo'lmaydi</li>
              <li>Burchakda «Sherzod-Abduxalimov» belgisi turadi</li>
              <li>Havola 3 soatda eskiradi, boshqaga ulashib bo'lmaydi</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

function VideoSection({ lesson, onChanged }: { lesson: AdminLesson; onChanged: () => void }) {
  const toast = useToast();
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const v = lesson.video;

  // Yuklash davomida sahifadan chiqib ketishdan ogohlantirish
  useEffect(() => {
    if (!progress) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [progress]);

  async function start(file: File) {
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name)) {
      toast("Faqat video fayl tanlang", "error");
      return;
    }
    setError(null);
    abort.current = new AbortController();
    const oldVideoId = lesson.video?.id ?? null;
    let attached = false;
    try {
      const done = await uploadVideo(
        file,
        async (p) => {
          setProgress(p);
          // Video yaratilishi bilan darsga biriktiramiz: sahifa yangilansa ham yo'qolmaydi
          if (!attached && p.video.id !== oldVideoId) {
            attached = true;
            await api.updateLesson(lesson.id, { videoId: p.video.id });
            if (oldVideoId) await api.deleteVideo(oldVideoId).catch(() => {});
            onChanged();
          }
        },
        abort.current.signal,
      );
      toast(done.status === "PROCESSING" ? "Yuklandi. Video tayyorlanmoqda…" : "Yuklandi");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(errMsg(e));
    } finally {
      setProgress(null);
      onChanged();
    }
  }

  const detach = useMutation({
    mutationFn: async () => {
      const vid = lesson.video!.id;
      await api.updateLesson(lesson.id, { videoId: null });
      await api.deleteVideo(vid).catch(() => {});
    },
    onSuccess: () => {
      toast("Video olib tashlandi");
      onChanged();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const retry = useMutation({ mutationFn: () => api.retryVideo(lesson.video!.id), onSuccess: onChanged, onError: (e) => toast(errMsg(e), "error") });

  if (progress) {
    const pct = Math.floor((progress.sent / progress.total) * 100);
    const eta = progress.speedBps > 0 ? Math.round((progress.total - progress.sent) / progress.speedBps) : null;
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="truncate font-semibold">{progress.video.originalName}</span>
          <button className="btn-ghost btn-sm" onClick={() => abort.current?.abort()}><X size={14} /> To'xtatish</button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {pct}% · {formatBytes(progress.sent)} / {formatBytes(progress.total)}
          {progress.speedBps > 0 && ` · ${formatBytes(progress.speedBps)}/s`}
          {eta !== null && ` · ~${eta > 90 ? `${Math.round(eta / 60)} daq` : `${eta} s`} qoldi`}
        </p>
        <p className="mt-1 text-xs text-slate-400">Internet uzilsa, yuklash o'zi davom etadi. Sahifani yopmang.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {v && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
          {v.status === "READY" ? <CheckCircle2 className="text-emerald-600" /> : v.status === "FAILED" ? <AlertTriangle className="text-red-600" /> : <Spinner className="text-amber-600" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{v.originalName}</p>
            <p className="text-xs text-slate-500">
              {v.status === "READY" && `Tayyor · ${v.durationSec ? `${Math.floor(v.durationSec / 60)}:${String(v.durationSec % 60).padStart(2, "0")}` : ""} · ${formatBytes(v.sizeBytes)}`}
              {v.status === "PROCESSING" && `Tayyorlanmoqda: ${v.processingPct ?? 0}% (shifrlash va sifatlarga ajratish)`}
              {v.status === "UPLOADING" && `Yuklash tugallanmagan: ${formatBytes(v.receivedBytes)} / ${formatBytes(v.sizeBytes)}. Davom ettirish uchun xuddi shu faylni qayta tanlang.`}
              {v.status === "FAILED" && `Xato: ${v.error ?? "noma'lum"}`}
            </p>
            {v.status === "PROCESSING" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${v.processingPct ?? 0}%` }} />
              </div>
            )}
          </div>
          {v.status === "FAILED" && (
            <button className="btn-secondary btn-sm" onClick={() => retry.mutate()}><RefreshCw size={14} /> Qayta urinish</button>
          )}
          <ConfirmButton onConfirm={() => detach.mutate()} label="Video o'chirilsinmi?"><Trash2 size={14} /></ConfirmButton>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const file = e.dataTransfer.files[0];
          if (file) void start(file);
        }}
        onClick={() => input.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
          drag ? "border-brand bg-brand-soft/40" : "border-slate-300 hover:border-brand hover:bg-slate-50"
        }`}
      >
        {v ? <Film className="text-slate-400" /> : <UploadCloud className="text-brand" size={32} />}
        <p className="text-sm font-bold">{v ? "Boshqa video yuklash" : "Videoni shu yerga tashlang yoki tanlang"}</p>
        <p className="text-xs text-slate-500">MP4, MOV, MKV, WEBM · 8 GB gacha</p>
        <input
          ref={input}
          type="file"
          accept="video/*,.mkv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void start(file);
          }}
        />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
