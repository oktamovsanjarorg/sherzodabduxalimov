import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

/** Pullik kontent uchun: obuna taklifi */
export function Paywall({ title = "Bu dars obunachilar uchun" }: { title?: string }) {
  const navigate = useNavigate();
  return (
    <div className="card flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Lock size={26} />
      </span>
      <div>
        <p className="text-base font-extrabold">{title}</p>
        <p className="mt-1 text-sm text-hint">
          Obuna bilan barcha videodarslar, mavzu testlari va mock imtihonlar ochiladi.
        </p>
      </div>
      <button className="btn-primary mt-1" onClick={() => navigate("/subscribe")}>
        Obuna bo'lish
      </button>
    </div>
  );
}
