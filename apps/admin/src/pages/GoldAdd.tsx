import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errMsg } from "../lib/api";
import { goldApi } from "../lib/gold-api";
import { useToast } from "../lib/toast";

/** Esse tafsilotida: shu esseni AI o'lchovi uchun sinov to'plamiga qo'shish (o'quvchi roziligi bilan) */
export function GoldAddButton({ essayId }: { essayId: string }) {
  const [consent, setConsent] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: () => goldApi.fromEssay(essayId),
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: ["gold"], exact: true });
      navigate(`/essays/gold/${g.id}`);
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex items-start gap-2 text-xs text-ink-2">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>O'quvchi ishidan AI sifatini o'lchash uchun foydalanishga rozi</span>
      </label>
      <button className="btn-secondary btn-sm" disabled={!consent || add.isPending} onClick={() => add.mutate()}>
        <FlaskConical size={16} /> Sinov to'plamiga qo'shish
      </button>
    </div>
  );
}
