import type { CourseView, LessonSummary, TopicView } from "@onatili/shared";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Lock, PlayCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatDuration } from "../lib/hooks";
import { haptic } from "../lib/telegram";

export function LessonsPage() {
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });

  return (
    <div className="mx-auto max-w-md">
      <h1 className="px-1 text-xl font-extrabold">Videodarslar</h1>
      <p className="mb-4 px-1 text-sm text-hint">Mavzular bo'yicha</p>

      {courses.isPending && <ListSkeleton />}
      {courses.isError && <p className="card text-sm text-danger">Yuklab bo'lmadi: {courses.error.message}</p>}
      {courses.data && !courses.data.some((c) => c.topics.some((t) => t.lessons.length)) && <p className="card text-center text-sm text-hint">Hozircha darslar yo'q</p>}
      {courses.data?.map((c) => <CourseBlock key={c.id} course={c} showTitle={courses.data.length > 1} />)}
    </div>
  );
}

/** Bitta kurs: faqat darsi bor mavzular. Kurs nomi bir nechta kurs bo'lsagina ko'rsatiladi */
function CourseBlock({ course, showTitle }: { course: CourseView; showTitle: boolean }) {
  const topics = course.topics.filter((t) => t.lessons.length > 0);
  if (!topics.length) return null;
  const pct = course.progress.total ? Math.round((course.progress.completed / course.progress.total) * 100) : 0;
  return (
    <section className="mb-6">
      <div className="mb-3 px-1">
        {showTitle && <h2 className="mb-1 text-base font-extrabold">{course.title}</h2>}
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hint/20">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-bold text-hint">
            {course.progress.completed}/{course.progress.total} dars
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {topics.map((t, i) => (
          <TopicBlock key={t.id} topic={t} index={i + 1} defaultOpen={i === 0} />
        ))}
      </div>
    </section>
  );
}

function TopicBlock({ topic, index, defaultOpen }: { topic: TopicView; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const done = topic.lessons.filter((l) => l.completed).length;
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
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-sm font-extrabold text-hint">
          {index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{topic.title}</span>
          <span className="block text-xs text-hint">
            {topic.lessons.length} ta dars · {done} ta tugatilgan
          </span>
        </span>
        <ChevronDown size={18} className={`text-hint transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-hint/10 px-2 pb-2">
          {topic.lessons.map((l) => (
            <LessonRow key={l.id} lesson={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function LessonRow({ lesson }: { lesson: LessonSummary }) {
  const navigate = useNavigate();
  const Icon = lesson.completed ? CheckCircle2 : lesson.locked ? Lock : PlayCircle;
  const iconCls = lesson.completed ? "text-success" : lesson.locked ? "text-hint" : "text-brand";
  return (
    <button
      className="tap flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
      onClick={() => {
        haptic();
        navigate(lesson.locked ? "/subscribe" : `/lesson/${lesson.id}`);
      }}
    >
      <Icon size={22} className={`shrink-0 ${iconCls}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${lesson.locked ? "text-hint" : ""}`}>{lesson.title}</span>
        {(lesson.durationSec || lesson.isFree) && (
          <span className="block text-xs text-hint">
            {[formatDuration(lesson.durationSec), lesson.isFree && !lesson.completed ? "bepul" : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </span>
    </button>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-24" />
      <div className="skeleton h-16" />
      <div className="skeleton h-16" />
    </div>
  );
}
