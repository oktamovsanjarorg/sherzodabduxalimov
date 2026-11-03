import { ClipboardCheck, FileText, ListChecks, PlayCircle } from "lucide-react";
import { Badge, QuickAction, SectionTitle } from "../components/ui";
import { useAuth } from "../store/auth";

export function HomePage() {
  const user = useAuth((s) => s.user)!;
  const sub = user.subscription;

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
        <div className="flex-1">
          <p className="text-xs text-hint">Xush kelibsiz</p>
          <h1 className="text-lg font-extrabold leading-tight">{user.firstName}</h1>
        </div>
        {sub ? <Badge>Obuna faol</Badge> : <Badge tone="muted">Bepul</Badge>}
      </header>

      {/* Davom ettirish kartasi */}
      <div className="card tap mt-5 bg-brand text-white">
        <p className="text-xs font-semibold opacity-80">Davom ettirish</p>
        <p className="mt-1 text-base font-bold">Fonetika · Unli tovushlar</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full w-1/3 rounded-full bg-white" />
        </div>
      </div>

      <SectionTitle>Tezkor kirish</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <QuickAction Icon={PlayCircle} label="Videodarslar" hint="Mavzular bo'yicha" />
        <QuickAction Icon={ListChecks} label="Mavzu testlari" hint="Mustahkamlash" />
        <QuickAction Icon={ClipboardCheck} label="Mock test" hint="Milliy sertifikat" />
        <QuickAction Icon={FileText} label="Esse yuborish" hint="AI va ustoz tekshiradi" />
      </div>

      <SectionTitle>Mening natijam</SectionTitle>
      <div className="card grid grid-cols-3 divide-x divide-hint/15 text-center">
        <Stat value="0" label="Dars" />
        <Stat value="0" label="Test" />
        <Stat value="—" label="O'rtacha" />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-xs text-hint">{label}</p>
    </div>
  );
}
