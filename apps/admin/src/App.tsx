import { Navigate, Route, Routes } from "react-router-dom";
import { AdvisorPage } from "./pages/AdvisorPage";
import { Layout } from "./components/Layout";
import type { Permission } from "@onatili/shared";
import { can, isOwner, loadSession } from "./lib/session";
import { AttendancePage } from "./pages/AttendancePage";
import { ContentPage } from "./pages/ContentPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StatsPage } from "./pages/StatsPage";
import { TrashPage } from "./pages/TrashPage";
import { EssaysPage } from "./pages/EssaysPage";
import { GoldEssayPage } from "./pages/GoldEssayPage";
import { ParentsPage } from "./pages/ParentsPage";
import { LessonEditorPage } from "./pages/LessonEditorPage";
import { LoginPage } from "./pages/LoginPage";
import { MorePage } from "./pages/MorePage";
import { QuestionsPage } from "./pages/QuestionsPage";
import { BillingSettingsPage } from "./pages/BillingSettingsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { StaffPage } from "./pages/StaffPage";
import { BackupsPage } from "./pages/BackupsPage";
import { ExternalTestPage, ExternalTestsPage } from "./pages/ExternalTestsPage";
import { StudentDetailPage } from "./pages/StudentDetailPage";
import { StudentsPage } from "./pages/StudentsPage";
import { TestEditorPage } from "./pages/TestEditorPage";
import { TestsPage } from "./pages/TestsPage";
import { AnnouncementsPage } from "./pages/AnnouncementsPage";
import { AnnounceComposerPage } from "./pages/AnnounceComposerPage";
import { AnnounceDetailPage } from "./pages/AnnounceDetailPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  return loadSession() ? children : <Navigate to="/login" replace />;
}

/** Bo'lim ruxsati: yo'q bo'lsa bosh sahifaga. owner: faqat egada (xodimlar, zaxira) */
function Gate({ children, perm, owner }: { children: JSX.Element; perm?: Permission; owner?: boolean }) {
  const ok = owner ? isOwner() : perm ? can(perm) : true;
  return ok ? children : <Navigate to="/" replace />;
}

const gated = (perm: Permission, el: JSX.Element) => <Gate perm={perm}>{el}</Gate>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="stats" element={gated("STATS", <StatsPage />)} />
        <Route path="advisor" element={gated("STATS", <AdvisorPage />)} />
        <Route path="content" element={gated("CONTENT", <ContentPage />)} />
        <Route path="lessons/:id" element={gated("CONTENT", <LessonEditorPage />)} />
        <Route path="questions" element={gated("CONTENT", <QuestionsPage />)} />
        <Route path="tests" element={gated("CONTENT", <TestsPage />)} />
        <Route path="tests/:id" element={gated("CONTENT", <TestEditorPage />)} />
        <Route path="essays" element={gated("ESSAYS", <EssaysPage />)} />
        <Route path="essays/gold/:id" element={gated("ESSAYS", <GoldEssayPage />)} />
        <Route path="external" element={gated("EXTERNAL", <ExternalTestsPage />)} />
        <Route path="external/:id" element={gated("EXTERNAL", <ExternalTestPage />)} />
        <Route path="students" element={gated("STUDENTS", <StudentsPage />)} />
        <Route path="students/:id" element={gated("STUDENTS", <StudentDetailPage />)} />
        <Route path="attendance" element={gated("GROUPS", <AttendancePage />)} />
        <Route path="parents" element={gated("PARENTS", <ParentsPage />)} />
        <Route path="payments" element={gated("PAYMENTS", <PaymentsPage />)} />
        <Route path="billing" element={gated("BILLING", <BillingSettingsPage />)} />
        <Route path="announcements" element={gated("ANNOUNCE", <AnnouncementsPage />)} />
        <Route path="announcements/new" element={gated("ANNOUNCE", <AnnounceComposerPage />)} />
        <Route path="announcements/:id/edit" element={gated("ANNOUNCE", <AnnounceComposerPage />)} />
        <Route path="announcements/:id" element={gated("ANNOUNCE", <AnnounceDetailPage />)} />
        <Route path="trash" element={gated("TRASH", <TrashPage />)} />
        <Route
          path="staff"
          element={
            <Gate owner>
              <StaffPage />
            </Gate>
          }
        />
        <Route
          path="backups"
          element={
            <Gate owner>
              <BackupsPage />
            </Gate>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
