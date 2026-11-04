import type { TopicView } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { TestCard } from "../components/TestCard";
import { api } from "../lib/api";
import { useBackButton } from "../lib/hooks";
import { haptic } from "../lib/telegram";
import { ListSkeleton } from "./LessonsPage";

/** Mavzulashtirilgan testlar: faqat testlar, mavzular bo'yicha */
export function TopicTestsPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/"));
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });
  const topics = (courses.data ?? []).flatMap((c) => c.topics).filter((t) => t.tests.length > 0);

  return (
    <FullPage>
      <h1 className="px-1 text-xl font-extrabold">Mavzu testlari</h1>
      <p className="mb-4 px-1 text-sm text-hint">Har bir mavzu bo'yicha bilimingizni mustahkamlang</p>
      {courses.isPending && <ListSkeleton />}
      {courses.isError && <p className="card text-sm text-danger">Yuklab bo'lmadi: {courses.error.message}</p>}
      {courses.data && !topics.length && <p className="card text-center text-sm text-hint">Hozircha testlar yo'q</p>}
      <div className="space-y-2">
        {topics.map((t, i) => (
          <TopicTests key={t.id} topic={t} index={i + 1} defaultOpen={topics.length <= 3 || i === 0} />
        ))}
      </div>
    </FullPage>
  );
}

function TopicTests({ topic, index, defaultOpen }: { topic: TopicView; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const done = topic.tests.filter((t) => t.bestPercent !== null).length;
  return (
    <div className="overflow-hidden rounded-card bg-section">
      <button
        className="tap flex w-full items-center gap-3 p-4 text-left"
        onClick={() => {
          haptic();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-sm font-extrabold text-hint">{index}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{topic.title}</span>
          <span className="block text-xs text-hint">
            {topic.tests.length} ta test · {done} ta ishlangan
          </span>
        </span>
        <ChevronDown size={18} className={`text-hint transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-hint/10 p-2">
          {topic.tests.map((t) => (
            <div key={t.id} className="[&>button]:bg-surface">
              <TestCard test={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
