import type {
  CreateEssayInput,
  EssayConfig,
  MyEssayDetail,
  MyEssaySummary,
  BillingView,
  MyPayment,
  ChildView,
  AttemptResult,
  AttemptState,
  AuthResponse,
  CourseView,
  LessonDetail,
  Me,
  SaveAnswerBody,
  StudentStats,
  TestSummary,
} from "@onatili/shared";
import { useAuth } from "../store/auth";
import { getInitData } from "./telegram";

export interface MyParents {
  inviteUrl: string;
  shareUrl: string;
  maxParents: number;
  parents: { id: string; name: string; status: "PENDING" | "APPROVED" | "REJECTED"; relation: string | null; rejectReason: string | null }[];
}

export interface MyAttempt {
  id: string;
  testTitle: string;
  testType: "TOPIC" | "MOCK";
  score: number;
  maxScore: number;
  percent: number;
  level: string | null;
  essayPending: boolean;
  finishedAt: string;
}

export interface MyAttendance {
  group: { name: string; schedule: string | null } | null;
  counts: Record<"PRESENT" | "LATE" | "ABSENT" | "EXCUSED", number>;
  records: { date: string; status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED"; note: string | null }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

const send = (path: string, init: RequestInit) => {
  const token = useAuth.getState().token;
  return fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
};

let relogin: Promise<boolean> | null = null;

/** Yangi token oladi. Bir vaqtda kelgan so'rovlar bitta kirishni kutadi */
function refreshToken() {
  relogin ??= (async () => {
    const initData = getInitData();
    if (!initData) return false;
    const res = await fetch("/api/auth/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) });
    if (!res.ok) return false;
    const auth = (await res.json()) as AuthResponse;
    useAuth.getState().setSession(auth.token, auth.user);
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      relogin = null;
    });
  return relogin;
}

/** Token 1 soat amal qiladi, mock esa 3 soat davom etadi: muddati tugasa yangilab, so'rov qayta yuboriladi */
async function authFetch(path: string, init: RequestInit = {}) {
  const res = await send(path, init);
  if (res.status !== 401 || path === "/auth/telegram") return res;
  const body = await res.clone().json().catch(() => ({}));
  if (body.code === "BLOCKED" || !(await refreshToken())) return res;
  return send(path, init);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Ustoz bloklagan: butun ilova o'rniga "bloklangan" ekrani
    if (res.status === 401 && body.code === "BLOCKED") useAuth.setState({ blocked: body.message ?? "Hisob bloklangan" });
    throw new ApiError(res.status, body.message ?? res.statusText, body.code);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  loginTelegram: (initData: string) => post<AuthResponse>("/auth/telegram", { initData }),
  me: () => request<Me>("/me"),
  myParents: () => request<MyParents>("/me/parents"),
  myChildren: () => request<ChildView[]>("/me/children"),
  stats: () => request<StudentStats>("/me/stats"),
  myAttempts: () => request<MyAttempt[]>("/me/attempts"),
  myAttendance: () => request<MyAttendance>("/me/attendance"),

  courses: () => request<CourseView[]>("/courses"),
  lesson: (id: string) => request<LessonDetail>(`/lessons/${id}`),
  completeLesson: (id: string) => post<{ ok: true }>(`/lessons/${id}/complete`),

  billing: () => request<BillingView>("/billing"),
  /** Chek rasmi xom baytlar sifatida yuboriladi */
  submitPayment: (target: { planId: string } | { essayId: string }, image: Blob, note: string) =>
    request<MyPayment>(`/billing/payments?${new URLSearchParams({ ...target, ...(note ? { note } : {}) })}`, {
      method: "POST",
      body: image,
      headers: { "Content-Type": image.type || "image/jpeg" },
    }),
  cancelPayment: (id: string) => request<{ ok: true }>(`/billing/payments/${id}`, { method: "DELETE" }),

  essayConfig: () => request<EssayConfig>("/essays/config"),
  essays: () => request<MyEssaySummary[]>("/essays"),
  essay: (id: string) => request<MyEssayDetail>(`/essays/${id}`),
  createEssay: (d: CreateEssayInput) => post<MyEssayDetail>("/essays", d),
  addEssayPage: (id: string, image: Blob) =>
    request<MyEssayDetail>(`/essays/${id}/pages`, { method: "POST", body: image, headers: { "Content-Type": image.type || "image/jpeg" } }),
  removeEssayPage: (id: string, n: number) => request<MyEssayDetail>(`/essays/${id}/pages/${n}`, { method: "DELETE" }),
  finishEssay: (id: string) => post<MyEssayDetail>(`/essays/${id}/finish`),
  retryEssay: (id: string) => post<MyEssayDetail>(`/essays/${id}/retry`),
  cancelEssay: (id: string) => post<MyEssayDetail>(`/essays/${id}/cancel`),
  deleteEssay: (id: string) => request<{ ok: true }>(`/essays/${id}`, { method: "DELETE" }),
  /** Varoq rasmi: avtorizatsiya kerak, shuning uchun blob URL */
  essayPage: async (id: string, n: number) => {
    const res = await authFetch(`/essays/${id}/pages/${n}`);
    if (!res.ok) throw new ApiError(res.status, "Rasmni yuklab bo'lmadi");
    return URL.createObjectURL(await res.blob());
  },

  voiceBlob: async (id: string) => {
    const res = await authFetch(`/voice/${id}`);
    if (!res.ok) throw new ApiError(res.status, "Ovozli izohni yuklab bo'lmadi");
    return URL.createObjectURL(await res.blob());
  },

  mocks: () => request<TestSummary[]>("/mocks"),
  startTest: (testId: string) => post<AttemptState>(`/tests/${testId}/attempts`),
  attempt: (id: string) => request<AttemptState | AttemptResult>(`/attempts/${id}`),
  saveAnswer: (attemptId: string, questionId: string, body: Partial<SaveAnswerBody>) =>
    request<{ ok: true }>(`/attempts/${attemptId}/answers/${questionId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  submit: (attemptId: string) => post<AttemptResult>(`/attempts/${attemptId}/submit`),
};

export const isFinished = (a: AttemptState | AttemptResult): a is AttemptResult => a.status !== "IN_PROGRESS";
