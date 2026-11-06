import { ROLE_LABELS } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Badge, ConfirmButton, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { loadSession } from "../lib/session";
import { useToast } from "../lib/toast";

export function StaffPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const me = loadSession()!.user;
  const [username, setUsername] = useState("");
  const staff = useQuery({ queryKey: ["staff"], queryFn: api.staff });
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  const add = useMutation({
    mutationFn: () => api.addStaff(username),
    onSuccess: (r) => {
      toast(r.status === "added" ? "Yordamchi qo'shildi" : "Taklif saqlandi: u botga kirganda yordamchi bo'ladi");
      setUsername("");
      refresh();
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.removeStaff(id), onSuccess: () => { toast("Olib tashlandi"); refresh(); }, onError: (e) => toast(errMsg(e), "error") });
  const removeInvite = useMutation({ mutationFn: (u: string) => api.removeInvite(u), onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });

  return (
    <>
      <PageHeader title="Xodimlar" subtitle="Yangi yordamchini Telegram username orqali taklif qiling." />
      <div className="card mb-5 grid gap-4 p-4 text-sm sm:grid-cols-2 sm:p-5">
        <div>
          <p className="mb-1 flex items-center gap-1.5 font-bold text-emerald-700">
            <Check size={16} /> Yordamchi qila oladi
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-slate-600">
            <li>Darslar, savollar, testlar, videolar</li>
            <li>Esselarni baholash</li>
            <li>O'quvchilarni kiritish, guruhlar, davomat</li>
            <li>Ota-onalarni tasdiqlash yoki bekor qilish</li>
          </ul>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1.5 font-bold text-red-700">
            <X size={16} /> Faqat ega (ustoz)
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-slate-600">
            <li>To'lovlar, cheklar, obunalar, qarzdorlar — umuman ko'rinmaydi</li>
            <li>Tariflar, karta raqami, esse narxi, oylik summalar</li>
            <li>O'quvchini bloklash, bepul ochish/yopish, botdagi o'quvchini o'chirish</li>
            <li>Xodimlarni qo'shish va olib tashlash</li>
          </ul>
        </div>
      </div>

      <form
        className="card mb-6 flex flex-wrap items-end gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (username.trim()) add.mutate();
        }}
      >
        <div className="w-full min-w-0 flex-1 sm:w-auto sm:min-w-[240px]">
          <label className="label">Yordamchi qo'shish</label>
          <input className="input" placeholder="@telegram_username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">U botga /admin deb yozib kiradi. Hali botga kirmagan bo'lsa ham qo'shsa bo'ladi.</p>
        </div>
        <button className="btn-primary" disabled={!username.trim() || add.isPending}><UserPlus size={16} /> Qo'shish</button>
      </form>

      {staff.isPending && <Spinner className="text-slate-400" />}
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {staff.data?.staff.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{s.firstName[0]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{s.firstName} {s.lastName ?? ""} {s.id === me.id && <span className="text-xs font-semibold text-slate-400">(siz)</span>}</p>
              <p className="text-xs text-slate-500">{s.username ? `@${s.username}` : "username yo'q"}</p>
            </div>
            <Badge tone={s.role === "TEACHER" ? "brand" : "blue"}>{s.isOwner ? "Ega" : ROLE_LABELS[s.role]}</Badge>
            {!s.isOwner && s.id !== me.id && <ConfirmButton onConfirm={() => remove.mutate(s.id)} label="Olib tashlansinmi?">Olib tashlash</ConfirmButton>}
          </div>
        ))}
        {staff.data?.invites.map((i) => (
          <div key={i.username} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Clock size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">@{i.username}</p>
              <p className="text-xs text-slate-500">Taklif qilingan: botga hali kirmagan</p>
            </div>
            <Badge tone="amber">Kutilmoqda</Badge>
            <ConfirmButton onConfirm={() => removeInvite.mutate(i.username)} label="Bekor qilinsinmi?">Bekor qilish</ConfirmButton>
          </div>
        ))}
      </div>
    </>
  );
}
