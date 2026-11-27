import { ROLE_LABELS } from "@onatili/shared";
import { Archive, BarChart3, Megaphone, ChevronRight, CreditCard, LogOut, Sparkles, Tags, Trash2, Users, UsersRound, type LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useNavGroups } from "../components/Layout";
import { can, clearSession, isOwner, loadSession } from "../lib/session";

type Item = { to: string; label: string; hint: string; Icon: LucideIcon; badge?: number; ok: boolean };

/** Telefondagi «Ko'proq»: pastki menyuga sig'magan bo'limlar va hisobdan chiqish */
export function MorePage() {
  const navigate = useNavigate();
  const s = loadSession()!;
  const more = useNavGroups().find((g) => g.to === "/more");
  const money: Item[] = [
    { to: "/announcements", label: "E'lonlar", hint: "Hammaga yoki guruhga xabar yuborish", Icon: Megaphone, ok: can("ANNOUNCE") },
    { to: "/payments", label: "To'lovlar", hint: "Cheklar, obunalar, qarzdorlar", Icon: CreditCard, badge: more?.badge, ok: can("PAYMENTS") },
    { to: "/billing", label: "Tariflar va karta", hint: "Narxlar, karta raqami, esse narxi", Icon: Tags, ok: can("BILLING") },
    { to: "/staff", label: "Xodimlar", hint: "Yordamchi qo'shish va ruxsatlar", Icon: Users, ok: isOwner() },
    { to: "/trash", label: "Korzinka", hint: "O'chirilganlarni tiklash", Icon: Trash2, ok: can("TRASH") },
    { to: "/backups", label: "Zaxira nusxalar", hint: "Ma'lumotlar bazasi zaxirasi", Icon: Archive, ok: isOwner() },
  ];
  const work: Item[] = [
    { to: "/advisor", label: "Yordamchi", hint: "Nima qilish kerak: aniq tavsiyalar", Icon: Sparkles, ok: can("STATS") },
    { to: "/stats", label: "Statistika", hint: "Oy bo'yicha natija va davomat", Icon: BarChart3, ok: can("STATS") },
    { to: "/parents", label: "Ota-onalar", hint: "Ulangan ota-onalar ro'yxati", Icon: UsersRound, ok: can("PARENTS") },
  ];
  return (
    <div className="space-y-5">
      <h1 className="sr-only">Ko'proq</h1>
      <div className="card flex items-center gap-3 p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">{s.user.firstName[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold">{[s.user.firstName, s.user.lastName].filter(Boolean).join(" ")}</p>
          <p className="text-sm text-ink-3">{ROLE_LABELS[s.user.role]}</p>
        </div>
      </div>
      <List title="Pul va boshqaruv" items={money.filter((i) => i.ok)} />
      <List title="Foydali" items={work.filter((i) => i.ok)} />
      <button
        className="btn-secondary w-full text-red-700"
        onClick={() => {
          clearSession();
          navigate("/login");
        }}
      >
        <LogOut size={16} /> Chiqish
      </button>
      <p className="text-center text-xs text-ink-4">Qayta kirish: botga /admin deb yozing</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-ink-3">{title}</h2>
      <ul className="card divide-y divide-line overflow-hidden p-0">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="flex min-h-[60px] items-center gap-3 px-4 py-3 hover:bg-surface-2 active:bg-surface-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <i.Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{i.label}</span>
                <span className="block truncate text-xs text-ink-3">{i.hint}</span>
              </span>
              {i.badge ? (
                <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-extrabold text-white">
                  {i.badge}
                </span>
              ) : null}
              <ChevronRight size={18} className="text-ink-4" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
