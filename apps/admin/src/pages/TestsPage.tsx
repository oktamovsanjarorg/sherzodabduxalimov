import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Empty, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";

export function TestsPage() {
  const [tab, setTab] = useState<"ALL" | "TOPIC" | "MOCK">("ALL");
  const tests = useQuery({ queryKey: ["tests"], queryFn: api.tests });
  const list = (tests.data ?? []).filter((t) => tab === "ALL" || t.type === tab);

  return (
    <>
      <PageHeader
        title="Testlar"
        subtitle="Mavzu testlari dars sahifasida, mock testlar alohida bo'limda chiqadi."
        actions={
          <>
            <Link to="/tests/new?type=TOPIC" className="btn-secondary"><Plus size={16} /> Mavzu testi</Link>
            <Link to="/tests/new?type=MOCK" className="btn-primary"><Plus size={16} /> Mock test</Link>
          </>
        }
      />
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
        {([["ALL", "Hammasi"], ["TOPIC", "Mavzu testlari"], ["MOCK", "Mock"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-brand text-white" : "text-slate-600"}`}>{l}</button>
        ))}
      </div>
      {tests.isPending && <Spinner className="text-slate-400" />}
      {tests.data && list.length === 0 && <Empty title="Test yo'q" />}
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {list.map((t) => (
          <Link key={t.id} to={`/tests/${t.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t.title}</p>
              <p className="text-xs text-slate-500">
                {t.type === "MOCK" ? "Mock test" : `Mavzu: ${t.topicTitle ?? "—"}`} · {t.questionCount} savol
                {t.timeLimitSec ? ` · ${Math.round(t.timeLimitSec / 60)} daqiqa` : ""} · {t.attemptCount} marta topshirilgan
              </p>
            </div>
            {t.isFree && <Badge tone="brand">Bepul</Badge>}
            {t.isPublished ? <Badge tone="green">Nashr</Badge> : <Badge>Qoralama</Badge>}
          </Link>
        ))}
      </div>
    </>
  );
}
