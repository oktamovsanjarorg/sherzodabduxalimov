import type { AdminCourse, AdminLesson, AdminTopic } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, FileText, Film, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, ConfirmButton, Empty, PageHeader, Spinner, Toggle } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { useToast } from "../lib/toast";

export function ContentPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const courses = useQuery({
    queryKey: ["courses"],
    queryFn: api.courses,
    // Video qayta ishlanayotgan bo'lsa, holatini yangilab turamiz
    refetchInterval: (q) => (q.state.data?.some((c) => c.topics.some((t) => t.lessons.some((l) => l.video?.status === "PROCESSING" || l.video?.status === "UPLOADING"))) ? 5000 : false),
  });
  const create = useMutation({
    mutationFn: () => api.createCourse({ title: "Yangi kurs" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <>
      <PageHeader
        title="Darslar"
        subtitle="Kurs → mavzu → dars. O'quvchilar faqat «Nashr qilingan» darslarni ko'radi."
        actions={
          <button className="btn-secondary" onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus size={16} /> Kurs qo'shish
          </button>
        }
      />
      {courses.isPending && <Spinner className="text-slate-400" />}
      {courses.isError && <p className="text-sm text-red-600">{errMsg(courses.error)}</p>}
      {courses.data?.length === 0 && <Empty title="Hali kurs yo'q" hint="Birinchi kursni yarating, keyin unga mavzu va darslar qo'shing." />}
      <div className="space-y-6">
        {courses.data?.map((c) => <CourseCard key={c.id} course={c} />)}
      </div>
    </>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  const toast = useToast();
  return {
    ok: (msg?: string) => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      if (msg) toast(msg);
    },
    fail: (e: unknown) => toast(errMsg(e), "error"),
  };
}

function InlineTitle({ value, onSave, className = "" }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  if (!edit)
    return (
      <button className={`group flex items-center gap-2 text-left ${className}`} onClick={() => { setV(value); setEdit(true); }}>
        {value}
        <Pencil size={14} className="text-slate-300 group-hover:text-slate-500" />
      </button>
    );
  const save = () => {
    if (v.trim() && v.trim() !== value) onSave(v.trim());
    setEdit(false);
  };
  return (
    <span className="flex flex-1 items-center gap-1">
      <input autoFocus className="input h-9" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(false); }} />
      <button className="btn-ghost h-9 w-9 p-0" onClick={save} aria-label="Saqlash"><Check size={16} /></button>
      <button className="btn-ghost h-9 w-9 p-0" onClick={() => setEdit(false)} aria-label="Bekor qilish"><X size={16} /></button>
    </span>
  );
}

function CourseCard({ course }: { course: AdminCourse }) {
  const r = useRefresh();
  const [newTopic, setNewTopic] = useState("");
  const update = useMutation({ mutationFn: (d: Parameters<typeof api.updateCourse>[1]) => api.updateCourse(course.id, d), onSuccess: () => r.ok("Saqlandi"), onError: r.fail });
  const del = useMutation({ mutationFn: () => api.deleteCourse(course.id), onSuccess: () => r.ok("Kurs o'chirildi"), onError: r.fail });
  const addTopic = useMutation({
    mutationFn: () => api.createTopic(course.id, newTopic.trim()),
    onSuccess: () => { setNewTopic(""); r.ok("Mavzu qo'shildi"); },
    onError: r.fail,
  });

  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-5 py-4">
        <InlineTitle value={course.title} onSave={(title) => update.mutate({ title })} className="text-lg font-extrabold" />
        <span className="flex-1" />
        <Toggle checked={course.isPublished} onChange={(isPublished) => update.mutate({ isPublished })} label={course.isPublished ? "Nashr qilingan" : "Yashirin"} />
        <ConfirmButton onConfirm={() => del.mutate()}><Trash2 size={14} /></ConfirmButton>
      </div>

      <div className="divide-y divide-slate-100">
        {course.topics.map((t, i) => (
          <TopicBlock key={t.id} topic={t} index={i} topicIds={course.topics.map((x) => x.id)} />
        ))}
      </div>

      <form
        className="flex gap-2 border-t border-slate-200 px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (newTopic.trim()) addTopic.mutate();
        }}
      >
        <input className="input max-w-sm" placeholder="Yangi mavzu nomi, masalan: Morfologiya" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
        <button className="btn-secondary" disabled={!newTopic.trim() || addTopic.isPending}>
          <Plus size={16} /> Mavzu
        </button>
      </form>
    </section>
  );
}

function move(ids: string[], i: number, d: -1 | 1) {
  const next = [...ids];
  [next[i], next[i + d]] = [next[i + d], next[i]];
  return next;
}

function TopicBlock({ topic, index, topicIds }: { topic: AdminTopic; index: number; topicIds: string[] }) {
  const r = useRefresh();
  const navigate = useNavigate();
  const rename = useMutation({ mutationFn: (title: string) => api.updateTopic(topic.id, title), onSuccess: () => r.ok("Saqlandi"), onError: r.fail });
  const del = useMutation({ mutationFn: () => api.deleteTopic(topic.id), onSuccess: () => r.ok("Mavzu o'chirildi"), onError: r.fail });
  const reorder = useMutation({ mutationFn: (a: { kind: "topic" | "lesson"; ids: string[] }) => api.reorder(a.kind, a.ids), onSuccess: () => r.ok(), onError: r.fail });
  const addLesson = useMutation({
    mutationFn: () => api.createLesson(topic.id, { title: "Yangi dars" }),
    onSuccess: (l) => {
      r.ok();
      navigate(`/lessons/${l.id}`);
    },
    onError: r.fail,
  });
  const lessonIds = topic.lessons.map((l) => l.id);

  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-extrabold text-slate-500">{index + 1}</span>
        <InlineTitle value={topic.title} onSave={(t) => rename.mutate(t)} className="font-bold" />
        <span className="flex-1" />
        <button className="btn-ghost h-8 w-8 p-0" disabled={index === 0} onClick={() => reorder.mutate({ kind: "topic", ids: move(topicIds, index, -1) })} aria-label="Yuqoriga"><ArrowUp size={15} /></button>
        <button className="btn-ghost h-8 w-8 p-0" disabled={index === topicIds.length - 1} onClick={() => reorder.mutate({ kind: "topic", ids: move(topicIds, index, 1) })} aria-label="Pastga"><ArrowDown size={15} /></button>
        <ConfirmButton onConfirm={() => del.mutate()} className="btn-ghost h-8 w-8 p-0 text-slate-400 hover:text-red-600"><Trash2 size={15} /></ConfirmButton>
      </div>

      <ul className="ml-9 space-y-1">
        {topic.lessons.map((l, i) => (
          <LessonRow
            key={l.id}
            lesson={l}
            first={i === 0}
            last={i === topic.lessons.length - 1}
            onMove={(d) => reorder.mutate({ kind: "lesson", ids: move(lessonIds, i, d) })}
          />
        ))}
        {topic.tests.map((t) => (
          <li key={t.id}>
            <Link to={`/tests/${t.id}`} className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm hover:bg-slate-50">
              <FileText size={16} className="text-sky-600" />
              <span className="flex-1 truncate font-semibold">{t.title}</span>
              <Badge tone="blue">Test · {t.questionCount} savol</Badge>
              {t.isPublished ? <Badge tone="green">Nashr</Badge> : <Badge>Qoralama</Badge>}
              <span className="w-16" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="ml-9 mt-2 flex gap-2">
        <button className="btn-ghost btn-sm text-brand" onClick={() => addLesson.mutate()} disabled={addLesson.isPending}>
          <Plus size={14} /> Dars qo'shish
        </button>
        <Link to={`/tests/new?topicId=${topic.id}`} className="btn-ghost btn-sm text-sky-700">
          <Plus size={14} /> Mavzu testi
        </Link>
      </div>
    </div>
  );
}

export function VideoBadge({ lesson }: { lesson: AdminLesson }) {
  const v = lesson.video;
  if (v?.status === "READY") return <Badge tone="green"><Film size={11} /> Video tayyor</Badge>;
  if (v?.status === "PROCESSING") return <Badge tone="amber"><Spinner className="h-3 w-3" /> Ishlanmoqda {v.processingPct ?? 0}%</Badge>;
  if (v?.status === "UPLOADING") return <Badge tone="amber">Yuklanmoqda {Math.round((v.receivedBytes / v.sizeBytes) * 100)}%</Badge>;
  if (v?.status === "FAILED") return <Badge tone="red">Video xato</Badge>;
  if (lesson.videoUrl) return <Badge tone="blue"><Link2 size={11} /> Havola</Badge>;
  return <Badge>Video yo'q</Badge>;
}

function LessonRow({ lesson, first, last, onMove }: { lesson: AdminLesson; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  return (
    <li className="group flex h-11 items-center gap-2 rounded-lg px-3 hover:bg-slate-50">
      <Film size={16} className="shrink-0 text-brand" />
      <Link to={`/lessons/${lesson.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-brand">
        {lesson.title}
      </Link>
      <VideoBadge lesson={lesson} />
      {lesson.isFree && <Badge tone="brand">Bepul</Badge>}
      {lesson.isPublished ? <Badge tone="green">Nashr</Badge> : <Badge>Qoralama</Badge>}
      <span className="flex opacity-0 transition group-hover:opacity-100">
        <button className="btn-ghost h-8 w-8 p-0" disabled={first} onClick={() => onMove(-1)} aria-label="Yuqoriga"><ArrowUp size={14} /></button>
        <button className="btn-ghost h-8 w-8 p-0" disabled={last} onClick={() => onMove(1)} aria-label="Pastga"><ArrowDown size={14} /></button>
      </span>
    </li>
  );
}
