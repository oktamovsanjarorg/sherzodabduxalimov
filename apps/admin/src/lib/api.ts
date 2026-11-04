import type {
  AdminPayment,
  AdminPlan,
  AdminSubscription,
  BillingCard,
  BillingSettingsInput,
  PaymentStatusName,
  PlanInput,
  AdminEssay,
  AdminPassage,
  PassageInput,
  AdminGroup,
  AdminParentLink,
  AdminStudent,
  AttendanceDay,
  AttendanceMonth,
  AttendanceSaveInput,
  GroupInput,
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

export interface AdminDashboard {
  pendingParents: number;
  pendingEssays: number;
  pendingPayments: number;
  videos: { processing: number; failed: number };
  students: { total: number; withoutApprovedParent: number };
  attendanceToday: { groups: { id: string; name: string; schedule: string | null; marked: number; total: number }[] };
  content: { lessonsPublished: number; lessonsDraft: number; tests: number; questions: number };
}

export interface StaffList {
  staff: { id: string; firstName: string; lastName: string | null; username: string | null; role: "TEACHER" | "ASSISTANT"; isOwner: boolean }[];
  invites: { username: string; role: string; createdAt: string }[];
}

export const api = {
  payments: (status: PaymentStatusName) => request<AdminPayment[]>(`/admin/payments?status=${status}`),
  approvePayment: (id: string) => request<{ ok: true; endsAt: string }>(`/admin/payments/${id}/approve`, json("POST")),
  rejectPayment: (id: string, reason: string) => request(`/admin/payments/${id}/reject`, json("POST", { reason })),
  /** Chek rasmi: avtorizatsiya sarlavhasi kerak, shuning uchun <img src> emas, blob */
  receipt: async (id: string) => {
    const res = await fetch(`/api/admin/payments/${id}/receipt`, { headers: { Authorization: `Bearer ${loadSession()?.token}` } });
    if (!res.ok) throw new ApiError(res.status, "Chekni yuklab bo'lmadi");
    return URL.createObjectURL(await res.blob());
  },
  subscriptions: () => request<AdminSubscription[]>("/admin/subscriptions"),
  grantSubscription: (d: { userId: string; planId: string; note: string | null }) => request<{ ok: true; endsAt: string }>("/admin/subscriptions", json("POST", d)),
  cancelSubscription: (id: string) => request(`/admin/subscriptions/${id}/cancel`, json("POST")),
  plans: () => request<AdminPlan[]>("/admin/plans"),
  createPlan: (d: PlanInput) => request("/admin/plans", json("POST", d)),
  updatePlan: (id: string, d: Partial<PlanInput>) => request(`/admin/plans/${id}`, json("PATCH", d)),
  billingSettings: () => request<{ card: BillingCard | null }>("/admin/billing-settings"),
  saveBillingSettings: (d: BillingSettingsInput) => request<BillingCard>("/admin/billing-settings", json("PUT", d)),

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

  groups: () => request<AdminGroup[]>("/admin/groups"),
  createGroup: (d: GroupInput) => request<AdminGroup>("/admin/groups", json("POST", d)),
  updateGroup: (id: string, d: Partial<GroupInput>) => request<AdminGroup>(`/admin/groups/${id}`, json("PATCH", d)),
  deleteGroup: (id: string) => request(`/admin/groups/${id}`, json("DELETE")),
  groupStudents: (id: string) => request<AdminStudent[]>(`/admin/groups/${id}/students`),
  addToGroup: (id: string, studentIds: string[]) => request(`/admin/groups/${id}/students`, json("POST", { studentIds })),
  removeFromGroup: (id: string, studentId: string) => request(`/admin/groups/${id}/students/${studentId}`, json("DELETE")),
  searchStudents: (q: string) => request<AdminStudent[]>(`/admin/students?search=${encodeURIComponent(q)}`),
  attendanceDay: (groupId: string, date: string) => request<AttendanceDay>(`/admin/groups/${groupId}/attendance?date=${date}`),
  saveAttendance: (groupId: string, d: AttendanceSaveInput) =>
    request<{ saved: number; notified: number }>(`/admin/groups/${groupId}/attendance`, json("PUT", d)),
  attendanceMonth: (groupId: string, month: string) => request<AttendanceMonth>(`/admin/groups/${groupId}/attendance/month?month=${month}`),

  parentLinks: (status: "PENDING" | "APPROVED" | "REJECTED") => request<AdminParentLink[]>(`/admin/parent-links?status=${status}`),
  approveParent: (id: string) => request(`/admin/parent-links/${id}/approve`, json("POST")),
  rejectParent: (id: string, reason: string) => request(`/admin/parent-links/${id}/reject`, json("POST", { reason })),

  dashboard: () => request<AdminDashboard>("/admin/dashboard"),
  passages: () => request<AdminPassage[]>("/admin/passages"),
  createPassage: (d: PassageInput) => request<AdminPassage>("/admin/passages", json("POST", d)),
  updatePassage: (id: string, d: Partial<PassageInput>) => request(`/admin/passages/${id}`, json("PATCH", d)),
  deletePassage: (id: string) => request(`/admin/passages/${id}`, json("DELETE")),
  essays: (status: "pending" | "reviewed") => request<AdminEssay[]>(`/admin/essays?status=${status}`),
  reviewEssay: (attemptId: string, questionId: string, d: { points: number; comment: string | null }) =>
    request<{ points: number; score: number }>(`/admin/essays/${attemptId}/${questionId}`, json("POST", d)),
  staff: () => request<StaffList>("/admin/staff"),
  addStaff: (username: string) => request<{ status: "added" | "invited" }>("/admin/staff", json("POST", { username })),
  removeStaff: (id: string) => request(`/admin/staff/${id}`, json("DELETE")),
  removeInvite: (username: string) => request(`/admin/invites/${encodeURIComponent(username)}`, json("DELETE")),
};

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Xatolik");
