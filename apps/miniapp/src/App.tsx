import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { api, ApiError } from "./lib/api";
import { getInitData } from "./lib/telegram";
import { HomePage } from "./pages/HomePage";
import { LessonsPage } from "./pages/LessonsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { useAuth } from "./store/auth";

/**
 * Sahifani alohida bo'lak (chunk) sifatida yuklaydi. Yangi versiya chiqqanda eski bo'lak fayllari
 * serverdan o'chadi: ochiq turgan eski ilova ularni topolmasa, bir marta sahifani yangilaymiz.
 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  return lazy(() =>
    load().then(
      (m) => {
        sessionStorage.removeItem("chunk-reload");
        return { default: m[name] as React.ComponentType };
      },
      (e: unknown) => {
        if (!sessionStorage.getItem("chunk-reload")) {
          sessionStorage.setItem("chunk-reload", "1");
          location.reload();
          return new Promise<never>(() => {});
        }
        throw e;
      },
    ),
  );
}

// Asosiy tablar darhol yuklanadi; qolgan sahifalar (video pleyer, test, esse) ochilganda
const AttemptPage = page(() => import("./pages/AttemptPage"), "AttemptPage");
const EssayPage = page(() => import("./pages/EssayPage"), "EssayPage");
const EssaysPage = page(() => import("./pages/EssaysPage"), "EssaysPage");
const NewEssayPage = page(() => import("./pages/EssaysPage"), "NewEssayPage");
const LessonPage = page(() => import("./pages/LessonPage"), "LessonPage");
const MocksPage = page(() => import("./pages/MocksPage"), "MocksPage");
const ParentHomePage = page(() => import("./pages/ParentHomePage"), "ParentHomePage");
const ParentPhonePage = lazy(() => import("./pages/ParentPhonePage").then((m) => ({ default: m.ParentPhonePage })));
const ParentsPage = page(() => import("./pages/ParentsPage"), "ParentsPage");
const MyAttendancePage = page(() => import("./pages/MyAttendancePage"), "MyAttendancePage");
const StudentNamePage = lazy(() => import("./pages/StudentNamePage").then((m) => ({ default: m.StudentNamePage })));
const SettingsPage = page(() => import("./pages/SettingsPage"), "SettingsPage");
const StatsPage = page(() => import("./pages/StatsPage"), "StatsPage");
const SubscribePage = page(() => import("./pages/SubscribePage"), "SubscribePage");
const TopicTestsPage = page(() => import("./pages/TopicTestsPage"), "TopicTestsPage");

export function App() {
  const initData = getInitData();
  const setSession = useAuth((s) => s.setSession);
  const user = useAuth((s) => s.user);
  const blocked = useAuth((s) => s.blocked);
  const [phoneSkipped, setPhoneSkipped] = useState(false);

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
  // Ota-ona havolasi orqali kelgan: raqam ilovaning o'zida so'raladi
  if (user?.pendingParentInvite && !phoneSkipped)
    return (
      <Suspense fallback={<Splash />}>
        <ParentPhonePage onSkip={() => setPhoneSkipped(true)} />
      </Suspense>
    );
  if (user?.role === "PARENT")
    return (
      <Suspense fallback={<Splash />}>
        <ParentHomePage />
      </Suspense>
    );
  if (user?.needsName)
    return (
      <Suspense fallback={<Splash />}>
        <StudentNamePage />
      </Suspense>
    );

  return (
    <Suspense fallback={<Splash />}>
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
    </Suspense>
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
