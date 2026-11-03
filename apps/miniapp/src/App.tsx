import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { api } from "./lib/api";
import { getInitData } from "./lib/telegram";
import { AttemptPage } from "./pages/AttemptPage";
import { HomePage } from "./pages/HomePage";
import { LessonPage } from "./pages/LessonPage";
import { LessonsPage } from "./pages/LessonsPage";
import { MocksPage } from "./pages/MocksPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SubscribePage } from "./pages/SubscribePage";
import { useAuth } from "./store/auth";

export function App() {
  const initData = getInitData();
  const setSession = useAuth((s) => s.setSession);

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
  if (session.isError) return <FullScreen title="Kirishda xatolik" text={session.error.message} />;

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
      <Route path="subscribe" element={<SubscribePage />} />
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
