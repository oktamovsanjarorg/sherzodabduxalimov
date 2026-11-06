import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, FileDown } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { Paywall } from "../components/Paywall";
import { ProtectedPlayer, exitPlayerFullscreen } from "../components/ProtectedPlayer";
import { VideoPlayer } from "../components/VideoPlayer";
import { ApiError, api } from "../lib/api";
import { useBackButton } from "../lib/hooks";
import { hapticResult, openExternal } from "../lib/telegram";
import { FullPage } from "../components/FullPage";

export function LessonPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Video to'liq ekranda bo'lsa, "Orqaga" avval undan chiqaradi
  useBackButton(() => {
    if (!exitPlayerFullscreen()) navigate("/lessons");
  });

  const lesson = useQuery({ queryKey: ["lesson", id], queryFn: () => api.lesson(id), retry: false });
  const complete = useMutation({
    mutationFn: () => api.completeLesson(id),
    onSuccess: () => {
      hapticResult("success");
      qc.invalidateQueries({ queryKey: ["lesson", id] });
      qc.invalidateQueries({ queryKey: ["courses"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  if (lesson.isPending) {
    return (
      <FullPage>
        <div className="skeleton aspect-video w-full" />
        <div className="skeleton mt-4 h-6 w-2/3" />
        <div className="skeleton mt-3 h-32" />
      </FullPage>
    );
  }
  if (lesson.isError) {
    const e = lesson.error;
    return (
      <FullPage>
        {e instanceof ApiError && e.code === "SUBSCRIPTION_REQUIRED" ? (
          <Paywall />
        ) : e instanceof ApiError && e.code === "TRIAL_LIMIT" ? (
          <div className="card text-center">
            <p className="text-sm text-hint">{e.message}</p>
            <button className="btn-primary mt-3" onClick={() => navigate("/parents")}>
              Ota-ona holatini ko'rish
            </button>
          </div>
        ) : (
          <p className="card text-center text-sm text-hint">
            {e instanceof ApiError && e.status === 404 ? "Dars topilmadi" : `Xatolik: ${e.message}`}
          </p>
        )}
      </FullPage>
    );
  }

  const l = lesson.data;
  return (
    <FullPage>
      <p className="px-1 text-xs font-semibold text-brand">{l.topicTitle}</p>
      <h1 className="mb-4 px-1 text-xl font-extrabold leading-tight">{l.title}</h1>

      {l.video?.status === "READY" && l.video.hlsUrl ? (
        <ProtectedPlayer
          src={l.video.hlsUrl}
          // Token muddati (3 soat) tugasa: darsni qayta yuklab yangi token olamiz
          onExpired={() => qc.invalidateQueries({ queryKey: ["lesson", id] })}
        />
      ) : l.video?.status === "PROCESSING" ? (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-card bg-section text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
          <p className="text-sm font-semibold text-hint">Video tayyorlanmoqda, birozdan keyin oching</p>
        </div>
      ) : (
        l.videoUrl && <VideoPlayer url={l.videoUrl} />
      )}

      {l.content && (
        <div className="card mt-4">
          <Markdown text={l.content} />
        </div>
      )}

      {l.attachments.length > 0 && (
        <div className="card mt-4 space-y-1 p-2">
          {l.attachments.map((a) => (
            <button
              key={a.url}
              onClick={() => openExternal(a.url)}
              className="tap flex h-12 w-full items-center gap-3 rounded-xl px-2 text-left"
            >
              <FileDown size={20} className="text-brand" />
              <span className="truncate text-sm font-semibold">{a.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        {l.completed ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-success/15 text-sm font-bold text-success">
            <Check size={18} /> Dars tugatildi
          </div>
        ) : (
          <button className="btn-primary" disabled={complete.isPending} onClick={() => complete.mutate()}>
            <Check size={18} /> Darsni tugatdim
          </button>
        )}
      </div>

      {l.nextLessonId && (
        <button className="btn-ghost mt-4" onClick={() => navigate(`/lesson/${l.nextLessonId}`, { replace: true })}>
          Keyingi dars <ArrowRight size={18} />
        </button>
      )}
    </FullPage>
  );
}
