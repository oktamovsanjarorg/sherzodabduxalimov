import { formatDuration } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Empty, NoMatch, PageHeader, SearchBox, Spinner, Chips } from "../components/ui";
import { matches } from "../lib/search";
import { api } from "../lib/api";

export function TestsPage() {
  const [tab, setTab] = useState<"ALL" | "TOPIC" | "MOCK">("ALL");
  const tests = useQuery({ queryKey: ["tests"], queryFn: api.tests });
  const [q, setQ] = useState("");
  const list = (tests.data ?? []).filter((t) => (tab === "ALL" || t.type === tab) && matches(q, t.title, t.topicTitle));

  return (
    <>
      <PageHeader
        title="Testlar"
        subtitle="Mavzu testi o'z mavzusining darslari ostida, mock test ilovadagi «Mock testlar» bo'limida chiqadi. Savollar «Savollar banki»dan olinadi."
        actions={
          <>
            <Link to="/tests/new?type=TOPIC" className="btn-secondary">
              <Plus size={16} /> Mavzu testi
            </Link>
            <Link to="/tests/new?type=MOCK" className="btn-primary">
              <Plus size={16} /> Mock test
            </Link>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Chips
          value={tab}
          onChange={setTab}
          options={
            [
              ["ALL", "Hammasi"],
              ["TOPIC", "Mavzu testlari"],
              ["MOCK", "Mock testlar"],
            ] as const
          }
        />
        <SearchBox value={q} onChange={setQ} placeholder="Test yoki mavzu nomi" />
      </div>
      {tests.isPending && <Spinner className="text-ink-4" />}
      {tests.data && list.length === 0 && (q.trim() ? <NoMatch q={q} onClear={() => setQ("")} /> : <Empty Icon={ListChecks} title="Test yo'q" />)}
      <div className="card divide-y divide-line overflow-hidden empty:hidden">
        {list.map((t) => (
          <Link key={t.id} to={`/tests/${t.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t.title}</p>
              <p className="text-xs text-ink-3">
                {t.type === "MOCK" ? "Mock test" : `Mavzu: ${t.topicTitle ?? "—"}`} · {t.questionCount} savol
                {t.timeLimitSec ? ` · ${formatDuration(t.timeLimitSec)}` : ""} · {t.attemptCount} marta topshirilgan
              </p>
            </div>
            {/* Mavzusi o'chirilgan mavzu testi o'quvchi ilovasida hech qayerda chiqmaydi */}
            {t.type === "TOPIC" && !t.topicId && <Badge tone="red">Mavzusiz: ko'rinmaydi</Badge>}
            {t.isFree && <Badge tone="brand">Bepul</Badge>}
            {t.isPublished ? <Badge tone="green">Nashr</Badge> : <Badge>Qoralama</Badge>}
          </Link>
        ))}
      </div>
    </>
  );
}
