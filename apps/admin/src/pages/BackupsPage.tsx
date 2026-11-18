import type { BackupFile } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { Archive, Database, Download, Film, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Empty, PageHeader, Spinner } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { useToast } from "../lib/toast";

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.max(0.1, b / 1024 ** 2).toFixed(1)} MB`);

/** Kechalik zaxira nusxalari: faqat ega yuklab oladi */
export function BackupsPage() {
  const q = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  // Bir kunlik db va media yonma-yon
  const days = new Map<string, BackupFile[]>();
  for (const f of q.data?.files ?? []) {
    const k = f.createdAt.slice(0, 10);
    days.set(k, [...(days.get(k) ?? []), f]);
  }
  return (
    <>
      <PageHeader
        title="Zaxira nusxalari"
        subtitle="Har kecha 03:00 da baza va media nusxasi olinadi, serverda 14 kun, bulutda (S3) 90 kun saqlanadi. Bu yerdan kompyuteringizga yuklab olishingiz mumkin."
      />
      <div className="mb-4 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <p>
          Baza faylida barcha o'quvchilar, telefonlar va to'lovlar bor. Faqat o'zingizning ishonchli qurilmangizga yuklang va hech kimga yubormang. Har bir yuklab olish
          jurnalga yoziladi.
        </p>
      </div>
      {q.isPending && <Spinner className="text-ink-4" />}
      {q.isError && <Empty title="Ro'yxatni olib bo'lmadi" hint={errMsg(q.error)} />}
      {q.data && !q.data.enabled && <Empty title="Zaxira papkasi ulanmagan" hint="Serverda API'ga zaxira papkasi (BACKUP_DIR) ulanmagan. Bu odatda staging'da shunday." />}
      {q.data?.enabled && q.data.files.length === 0 && <Empty Icon={Archive} title="Hali zaxira yo'q" />}
      <div className="space-y-3">
        {[...days].map(([day, files]) => (
          <section key={day} className="card p-4">
            <p className="mb-2 text-sm font-bold">{fmtDateTime(files[0].createdAt)}</p>
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <DownloadButton key={f.name} file={f} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function DownloadButton({ file }: { file: BackupFile }) {
  const toast = useToast();
  const [pct, setPct] = useState<number | null>(null);
  const Icon = file.kind === "db" ? Database : Film;
  return (
    <button
      className="btn-secondary"
      disabled={pct !== null}
      onClick={async () => {
        setPct(0);
        try {
          await api.downloadBackup(file.name, setPct);
        } catch (e) {
          toast(errMsg(e), "error");
        } finally {
          setPct(null);
        }
      }}
    >
      <Icon size={16} />
      {file.kind === "db" ? "Baza" : "Media"} · {mb(file.sizeBytes)}
      {pct !== null ? <span className="text-ink-3">{pct}%</span> : <Download size={15} className="text-ink-3" />}
    </button>
  );
}
