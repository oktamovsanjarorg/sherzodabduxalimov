import type {
  AdminCourse,
  AdminLesson,
  AdminQuestion,
  AdminTestDetail,
  AdminTestRow,
  AdminVideo,
  AuthResponse,
  CourseInput,
  LessonInput,
  Paged,
  QuestionInput,
  TestInput,
} from "@onatili/shared";
import { clearSession, loadSession } from "./session";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = loadSession()?.token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && !path.startsWith("/auth/")) {
    clearSession();
    window.location.href = `${import.meta.env.BASE_URL}login?expired=1`;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? res.statusText, body);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface StaffList {
  staff: { id: string; firstName: string; lastName: string | null; username: string | null; role: "TEACHER" | "ASSISTANT"; isOwner: boolean }[];
  invites: { username: string; role: string; createdAt: string }[];
}

export const api = {
  consumeLink: (token: string) => request<AuthResponse>("/auth/admin-link", json("POST", { token })),

  courses: () => request<AdminCourse[]>("/admin/courses"),
  createCourse: (d: CourseInput) => request<AdminCourse>("/admin/courses", json("POST", d)),
  updateCourse: (id: string, d: Partial<CourseInput>) => request<AdminCourse>(`/admin/courses/${id}`, json("PATCH", d)),
  deleteCourse: (id: string) => request(`/admin/courses/${id}`, json("DELETE")),

  createTopic: (courseId: string, title: string) => request(`/admin/courses/${courseId}/topics`, json("POST", { title })),
  updateTopic: (id: string, title: string) => request(`/admin/topics/${id}`, json("PATCH", { title })),
  deleteTopic: (id: string) => request(`/admin/topics/${id}`, json("DELETE")),

  lesson: (id: string) => request<AdminLesson>(`/admin/lessons/${id}`),
  createLesson: (topicId: string, d: LessonInput) => request<AdminLesson>(`/admin/topics/${topicId}/lessons`, json("POST", d)),
  updateLesson: (id: string, d: Partial<LessonInput>) => request<AdminLesson>(`/admin/lessons/${id}`, json("PATCH", d)),
  deleteLesson: (id: string) => request(`/admin/lessons/${id}`, json("DELETE")),
  reorder: (kind: "course" | "topic" | "lesson", ids: string[]) => request("/admin/reorder", json("POST", { kind, ids })),

  questions: (p: { topicId?: string; search?: string; page?: number }) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
    return request<Paged<AdminQuestion>>(`/admin/questions?${q}`);
  },
  createQuestion: (d: QuestionInput) => request<AdminQuestion>("/admin/questions", json("POST", d)),
  updateQuestion: (id: string, d: QuestionInput) => request<AdminQuestion>(`/admin/questions/${id}`, json("PATCH", d)),
  deleteQuestion: (id: string) => request(`/admin/questions/${id}`, json("DELETE")),

  tests: () => request<AdminTestRow[]>("/admin/tests"),
  test: (id: string) => request<AdminTestDetail>(`/admin/tests/${id}`),
  createTest: (d: TestInput) => request<AdminTestDetail>("/admin/tests", json("POST", d)),
  updateTest: (id: string, d: TestInput) => request<AdminTestDetail>(`/admin/tests/${id}`, json("PATCH", d)),
  deleteTest: (id: string) => request(`/admin/tests/${id}`, json("DELETE")),

  createVideo: (filename: string, size: number) =>
    request<AdminVideo & { chunkSize: number }>("/admin/videos", json("POST", { filename, size })),
  video: (id: string) => request<AdminVideo>(`/admin/videos/${id}`),
  uploadChunk: (id: string, offset: number, chunk: Blob, signal?: AbortSignal) =>
    request<AdminVideo>(`/admin/videos/${id}/chunk?offset=${offset}`, {
      method: "PUT",
      body: chunk,
      headers: { "Content-Type": "application/octet-stream" },
      signal,
    }),
  retryVideo: (id: string) => request<AdminVideo>(`/admin/videos/${id}/retry`, json("POST")),
  deleteVideo: (id: string) => request(`/admin/videos/${id}`, json("DELETE")),

  staff: () => request<StaffList>("/admin/staff"),
  addStaff: (username: string) => request<{ status: "added" | "invited" }>("/admin/staff", json("POST", { username })),
  removeStaff: (id: string) => request(`/admin/staff/${id}`, json("DELETE")),
  removeInvite: (username: string) => request(`/admin/invites/${encodeURIComponent(username)}`, json("DELETE")),
};

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Xatolik");
