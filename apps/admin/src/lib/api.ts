import type {
  PaymentInsights,
  NewcomerRow,
  DuplicateRow,
  TeacherStats,
  AdminPayment,
  AdminPlan,
  AdminSubscriptions,
  VoiceView,
  EssayAnnotations,
  TextMark,
  RosterRow,
  StudentCreateInput,
  StudentDetail,
  AdminHwEssay,
  TeacherEssayReviewInput,
  OfflineLedger,
  BillingCard,
  BillingSettingsInput,
  PaymentStatusName,
  PlanInput,
  AdminEssay,
  AdminPassage,
  PassageInput,
  AdminGroup,
  AdminParentLink,
  AdminUserRow,
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
  newStudents: number;
  pendingEssays: number;
  pendingPayments: number;
  expiringSubscriptions: number;
  videos: { processing: number; failed: number };
  students: { total: number; withoutApprovedParent: number };
  attendanceToday: { date: string; groups: { id: string; name: string; schedule: string | null; marked: number; total: number }[] };
  attendanceMissed: { groupId: string; name: string; date: string }[];
  content: { lessonsPublished: number; lessonsDraft: number; tests: number; questions: number };
}

export interface TrashRow {
  id: string;
  kind: string;
  title: string;
  rows: number;
  deletedBy: string | null;
  createdAt: string;
  purgeAt: string;
}

export interface StaffList {
  staff: { id: string; firstName: string; lastName: string | null; username: string | null; role: "TEACHER" | "ASSISTANT"; isOwner: boolean }[];
  invites: { username: string; role: string; createdAt: string }[];
}

export const api = {
  users: (q: string) => request<AdminUserRow[]>(`/admin/users?${new URLSearchParams(q ? { q } : {})}`),
  roster: (groupId: string, q: string) => request<RosterRow[]>(`/admin/roster?${new URLSearchParams({ ...(groupId ? { groupId } : {}), ...(q ? { q } : {}) })}`),
  student: (id: string) => request<StudentDetail>(`/admin/students/${id}`),
  createStudent: (d: StudentCreateInput) => request<{ studentId: string }>("/admin/students", json("POST", d)),
  bulkStudents: (groupId: string | null, text: string) => request<{ added: number; skipped: { line: string; reason: string }[] }>("/admin/students/bulk", json("POST", { groupId, text })),
  updateStudent: (id: string, d: Partial<StudentCreateInput>) => request<StudentDetail>(`/admin/students/${id}`, json("PATCH", d)),
  deleteStudent: (id: string, force = false) => request(`/admin/students/${id}${force ? "?force=1" : ""}`, json("DELETE")),
  setStudentAccess: (id: string, mode: "AUTO" | "FREE" | "CLOSED") => request<StudentDetail>(`/admin/students/${id}/access`, json("PATCH", { mode })),
  blockStudent: (id: string, blocked: boolean, reason: string | null) => request<StudentDetail>(`/admin/students/${id}/block`, json("POST", { blocked, reason })),
  deleteParentLink: (id: string) => request(`/admin/parent-links/${id}`, json("DELETE")),
  resetStudentInvite: (id: string) => request<{ inviteUrl: string }>(`/admin/students/${id}/invite`, json("POST")),
  payments: (status: PaymentStatusName) => request<AdminPayment[]>(`/admin/payments?status=${status}`),
  approvePayment: (id: string) => request<{ ok: true; endsAt: string | null }>(`/admin/payments/${id}/approve`, json("POST")),
  rejectPayment: (id: string, reason: string) => request(`/admin/payments/${id}/reject`, json("POST", { reason })),
  revokePayment: (id: string, reason: string) => request(`/admin/payments/${id}/revoke`, json("POST", { reason })),
  /** Hamma ma'lumot bitta Excel faylda: avtorizatsiya sarlavhasi kerak, shuning uchun oddiy havola emas, blob */
  exportXlsx: async () => {
    const res = await fetch("/api/admin/export/xlsx", { headers: { Authorization: `Bearer ${loadSession()?.token}` } });
    if (!res.ok) throw new ApiError(res.status, "Faylni tayyorlab bo'lmadi");
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "onatili.xlsx";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return name;
  },
  /** Chek rasmi: avtorizatsiya sarlavhasi kerak, shuning uchun <img src> emas, blob */
  receipt: async (id: string) => {
    const res = await fetch(`/api/admin/payments/${id}/receipt`, { headers: { Authorization: `Bearer ${loadSession()?.token}` } });
    if (!res.ok) throw new ApiError(res.status, "Chekni yuklab bo'lmadi");
    return URL.createObjectURL(await res.blob());
  },
  subscriptions: () => request<AdminSubscriptions>("/admin/subscriptions"),
  offlineLedger: (groupId: string, month: string) => request<OfflineLedger>(`/admin/offline-payments?groupId=${groupId}&month=${month}`),
  markOffline: (d: { studentId: string; month: string; amountUzs?: number; note?: string | null }) => request("/admin/offline-payments", json("PUT", d)),
  unmarkOffline: (studentId: string, month: string) => request(`/admin/offline-payments/${studentId}/${month}`, json("DELETE")),
  setGroupFee: (groupId: string, monthlyFeeUzs: number | null) => request(`/admin/offline-payments/groups/${groupId}/fee`, json("PATCH", { monthlyFeeUzs })),
  remindDebtors: (groupId: string, month: string) => request<{ students: number; messages: number }>("/admin/offline-payments/remind", json("POST", { groupId, month })),
  grantSubscription: (d: { userId: string; planId: string; note: string | null }) => request<{ ok: true; endsAt: string }>("/admin/subscriptions", json("POST", d)),
  cancelSubscription: (id: string) => request(`/admin/subscriptions/${id}/cancel`, json("POST")),
  saveHwAnnotations: (id: string, a: EssayAnnotations) => request<{ ok: true; counts: Record<string, number> }>(`/admin/hw-essays/${id}/annotations`, json("PUT", a)),
  saveMockMarks: (attemptId: string, questionId: string, marks: TextMark[]) => request(`/admin/essays/${attemptId}/${questionId}/annotations`, json("PUT", marks)),
  /** Ovozli izoh: xom audio (Content-Type — yozuv formati) */
  uploadHwVoice: (id: string, audio: Blob) =>
    request<VoiceView>(`/admin/hw-essays/${id}/voice`, { method: "POST", body: audio, headers: { "Content-Type": audio.type || "audio/webm" } }),
  uploadMockVoice: (attemptId: string, questionId: string, audio: Blob) =>
    request<VoiceView>(`/admin/essays/${attemptId}/${questionId}/voice`, { method: "POST", body: audio, headers: { "Content-Type": audio.type || "audio/webm" } }),
  voiceBlob: async (id: string) => {
    const res = await fetch(`/api/voice/${id}`, { headers: { Authorization: `Bearer ${loadSession()?.token}` } });
    if (!res.ok) throw new ApiError(res.status, "Ovozni yuklab bo'lmadi");
    return URL.createObjectURL(await res.blob());
  },
  hwEssays: (status: "pending" | "reviewed") => request<AdminHwEssay[]>(`/admin/hw-essays?status=${status}`),
  reviewHwEssay: (id: string, d: TeacherEssayReviewInput) => request<{ totalScore: number }>(`/admin/hw-essays/${id}/review`, json("POST", d)),
  /** Varoq rasmi (avtorizatsiya bilan blob) */
  essayPage: async (id: string, n: number) => {
    const res = await fetch(`/api/essays/${id}/pages/${n}`, { headers: { Authorization: `Bearer ${loadSession()?.token}` } });
    if (!res.ok) throw new ApiError(res.status, "Rasmni yuklab bo'lmadi");
    return URL.createObjectURL(await res.blob());
  },
  essaySettings: () => request<{ priceUzs: number | null }>("/admin/essay-settings"),
  saveEssaySettings: (priceUzs: number | null) => request("/admin/essay-settings", json("PUT", { priceUzs })),
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
  newcomers: () => request<NewcomerRow[]>("/admin/students/new"),
  duplicates: () => request<DuplicateRow[]>("/admin/students/duplicates"),
  trash: () => request<TrashRow[]>("/admin/trash"),
  restoreTrash: (id: string) => request<{ ok: true; kind: string; entityId: string }>(`/admin/trash/${id}/restore`, json("POST")),
  purgeTrash: (id: string) => request(`/admin/trash/${id}`, json("DELETE")),
  linkStudent: (id: string, placeholderStudentId: string) => request<{ ok: true; name: string }>(`/admin/students/${id}/link`, json("POST", { placeholderStudentId })),
  acceptStudent: (id: string, groupId: string | null) => request(`/admin/students/${id}/accept`, json("POST", { groupId })),
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
  stats: (month: string) => request<TeacherStats>(`/admin/stats?month=${month}`),
  paymentInsights: (month: string) => request<PaymentInsights>(`/admin/stats/payments?month=${month}`),
  paymentAi: (month: string) => request<{ text: string; generatedAt: string }>(`/admin/stats/payments/ai?month=${month}`, json("POST")),
  addFollowUp: (d: { studentId: string; month: string; kind: "CALL" | "MESSAGE" | "PROMISE" | "REASON"; note?: string | null; promisedAt?: string | null }) =>
    request<{ id: string }>("/admin/payment-followups", json("POST", d)),
  removeFollowUp: (id: string) => request(`/admin/payment-followups/${id}`, json("DELETE")),
  passages: () => request<AdminPassage[]>("/admin/passages"),
  createPassage: (d: PassageInput) => request<AdminPassage>("/admin/passages", json("POST", d)),
  updatePassage: (id: string, d: Partial<PassageInput>) => request(`/admin/passages/${id}`, json("PATCH", d)),
  deletePassage: (id: string) => request(`/admin/passages/${id}`, json("DELETE")),
  essays: (status: "pending" | "reviewed") => request<AdminEssay[]>(`/admin/essays?status=${status}`),
  reviewEssay: (attemptId: string, questionId: string, d: { points?: number; special?: string | null; criteria?: { key: string; score: number }[]; comment: string | null }) =>
    request<{ points: number; score: number }>(`/admin/essays/${attemptId}/${questionId}`, json("POST", d)),
  staff: () => request<StaffList>("/admin/staff"),
  addStaff: (username: string) => request<{ status: "added" | "invited" }>("/admin/staff", json("POST", { username })),
  removeStaff: (id: string) => request(`/admin/staff/${id}`, json("DELETE")),
  removeInvite: (username: string) => request(`/admin/invites/${encodeURIComponent(username)}`, json("DELETE")),
};

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Xatolik");
