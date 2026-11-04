import type {
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
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
