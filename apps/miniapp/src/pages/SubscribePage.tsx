import { CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { formatDate, useBackButton } from "../lib/hooks";
import { useAuth } from "../store/auth";

const perks = [
  "Barcha videodarslar va konspektlar",
  "Mavzulashtirilgan testlar",
  "Milliy sertifikat formatidagi mock imtihonlar",
  "Natijalar tahlili va statistika",
];

// To'lov oqimi (chek yuklash, admin tasdiqlashi) 1-bosqichning keyingi qadamida qo'shiladi
export function SubscribePage() {
  const navigate = useNavigate();
  useBackButton(() => navigate(-1));
  const sub = useAuth((s) => s.user?.subscription);

  return (
    <FullPage>
      <h1 className="px-1 text-xl font-extrabold">Obuna</h1>
      {sub ? (
        <div className="card mt-4">
          <p className="font-bold">Obunangiz faol</p>
          <p className="text-sm text-hint">
            {sub.planName} · {formatDate(sub.endsAt)} gacha
          </p>
        </div>
      ) : (
        <>
          <div className="card mt-4 space-y-3">
            {perks.map((p) => (
              <p key={p} className="flex items-center gap-3 text-sm font-semibold">
                <CheckCircle2 size={20} className="shrink-0 text-brand" /> {p}
              </p>
            ))}
          </div>
          <div className="card mt-4 text-center">
            <p className="font-bold">To'lov tez orada ishga tushadi</p>
            <p className="mt-1 text-sm text-hint">Hozircha obuna uchun ustozning yordamchisiga murojaat qiling.</p>
          </div>
        </>
      )}
    </FullPage>
  );
}
