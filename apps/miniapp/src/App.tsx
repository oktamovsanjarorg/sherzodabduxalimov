import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { api, ApiError } from "./lib/api";
import { getInitData } from "./lib/telegram";
import { AttemptPage } from "./pages/AttemptPage";
import { EssayPage } from "./pages/EssayPage";
import { EssaysPage, NewEssayPage } from "./pages/EssaysPage";
import { HomePage } from "./pages/HomePage";
import { LessonPage } from "./pages/LessonPage";
import { LessonsPage } from "./pages/LessonsPage";
import { MocksPage } from "./pages/MocksPage";
import { ParentGatePage } from "./pages/ParentGatePage";
import { ParentHomePage } from "./pages/ParentHomePage";
import { ParentsPage } from "./pages/ParentsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { MyAttendancePage } from "./pages/MyAttendancePage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { SubscribePage } from "./pages/SubscribePage";
import { TopicTestsPage } from "./pages/TopicTestsPage";
import { useAuth } from "./store/auth";

export function App() {
  const initData = getInitData();
  const setSession = useAuth((s) => s.setSession);
  const user = useAuth((s) => s.user);
  const blocked = useAuth((s) => s.blocked);

  const session = useQuery({
    queryKey: ["session"],
    enabled: Boolean(initData),
    staleTime: Infinity,
    queryFn: async () => {
      const res = await api.loginTelegram(initData!);
      setSession(res.token, res.user);
      return res.user;
    },
  });

  if (!initData) return <FullScreen title="Ilovani Telegram ichida oching" text="Bot orqali «Ilovani ochish» tugmasini bosing." />;
  if (session.isPending) return <Splash />;
  if (blocked || (session.error instanceof ApiError && session.error.code === "BLOCKED"))
    return (
      <FullScreen
        title="Hisobingiz bloklangan"
        text={`${(blocked ?? session.error?.message ?? "").replace(/^Hisob bloklangan:?\s*/, "") || "Ustoz hisobingizni vaqtincha yopgan."} Savol bo'lsa, ustoz yoki yordamchiga murojaat qiling.`}
      />
    );
  if (session.isError) return <FullScreen title="Kirishda xatolik" text={session.error.message} />;
  // Ota-onasi ulanmagan o'quvchi: majburiy qadam (server ham kontentni yopiq tutadi)
  if (user?.role === "STUDENT" && user.parentStatus === "NONE") return <ParentGatePage />;
  if (user?.role === "PARENT") return <ParentHomePage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="lessons" element={<LessonsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      {/* Pastki navigatsiyasiz ichki sahifalar */}
      <Route path="lesson/:id" element={<LessonPage />} />
      <Route path="attempt/:id" element={<AttemptPage />} />
      <Route path="mocks" element={<MocksPage />} />
      <Route path="tests" element={<TopicTestsPage />} />
      <Route path="essays" element={<EssaysPage />} />
      <Route path="essays/new" element={<NewEssayPage />} />
      <Route path="essays/:id" element={<EssayPage />} />
      <Route path="subscribe" element={<SubscribePage />} />
      <Route path="parents" element={<ParentsPage />} />
      <Route path="stats" element={<StatsPage />} />
      <Route path="my-attendance" element={<MyAttendancePage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
    </div>
  );
}

function FullScreen({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-sm text-hint">{text}</p>
    </div>
  );
}
