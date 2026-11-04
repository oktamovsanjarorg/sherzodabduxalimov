import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardCheck, FileText, ListChecks, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, QuickAction, SectionTitle } from "../components/ui";
import { api } from "../lib/api";
import { haptic } from "../lib/telegram";
import { useAuth } from "../store/auth";

export function HomePage() {
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const sub = user.subscription;
  const s = stats.data;

  const go = (to: string) => () => {
    haptic();
    navigate(to);
  };

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-3 px-1">
        {user.photoUrl ? (
          <img src={user.photoUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
            {user.firstName[0]}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-hint">Xush kelibsiz</p>
          <h1 className="truncate text-lg font-extrabold leading-tight">{user.firstName}</h1>
        </div>
        <button onClick={go("/subscribe")}>{sub ? <Badge>Obuna faol</Badge> : user.offlineGroup ? <Badge>Offline guruh</Badge> : <Badge tone="muted">Bepul</Badge>}</button>
      </header>

      {/* Davom ettirish yoki boshlash kartasi */}
      {stats.isPending ? (
        <div className="skeleton mt-5 h-[92px]" />
      ) : (
        <button
          onClick={go(s?.lastLesson ? `/lesson/${s.lastLesson.id}` : "/lessons")}
          className="card tap mt-5 flex w-full items-center gap-3 bg-brand text-left text-white"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold opacity-80">{s?.lastLesson ? "Davom ettirish" : "Boshlash"}</span>
            <span className="mt-1 block truncate text-base font-bold">
              {s?.lastLesson ? `${s.lastLesson.topicTitle} · ${s.lastLesson.title}` : "Birinchi darsni ochish"}
            </span>
          </span>
          <ChevronRight size={22} className="shrink-0 opacity-80" />
        </button>
      )}

      <SectionTitle>Tezkor kirish</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <QuickAction Icon={PlayCircle} label="Videodarslar" hint="Mavzular bo'yicha" onClick={go("/lessons")} />
        <QuickAction Icon={ListChecks} label="Mavzu testlari" hint="Mustahkamlash" onClick={go("/lessons")} />
        <QuickAction Icon={ClipboardCheck} label="Mock test" hint="Milliy sertifikat" onClick={go("/mocks")} />
        <QuickAction Icon={FileText} label="Esse yuborish" hint="Tez orada" />
      </div>

      <SectionTitle>Mening natijam</SectionTitle>
      <div className="card grid grid-cols-3 divide-x divide-hint/15 text-center">
        <Stat value={s ? String(s.lessonsCompleted) : "…"} label="Dars" />
        <Stat value={s ? String(s.testsTaken) : "…"} label="Test" />
        <Stat value={s?.averagePercent != null ? `${s.averagePercent}%` : "—"} label="O'rtacha" />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-hint">{label}</p>
    </div>
  );
}
