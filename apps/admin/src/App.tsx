import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { loadSession } from "./lib/session";
import { AttendancePage } from "./pages/AttendancePage";
import { ContentPage } from "./pages/ContentPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StatsPage } from "./pages/StatsPage";
import { EssaysPage } from "./pages/EssaysPage";
import { ParentsPage } from "./pages/ParentsPage";
import { LessonEditorPage } from "./pages/LessonEditorPage";
import { LoginPage } from "./pages/LoginPage";
import { QuestionsPage } from "./pages/QuestionsPage";
import { BillingSettingsPage } from "./pages/BillingSettingsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { StaffPage } from "./pages/StaffPage";
import { StudentDetailPage } from "./pages/StudentDetailPage";
import { StudentsPage } from "./pages/StudentsPage";
import { TestEditorPage } from "./pages/TestEditorPage";
import { TestsPage } from "./pages/TestsPage";

function RequireAuth({ children, teacher }: { children: JSX.Element; teacher?: boolean }) {
  const s = loadSession();
  if (!s) return <Navigate to="/login" replace />;
  if (teacher && s.user.role !== "TEACHER") return <Navigate to="/" replace />;
  return children;
}

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
        <Route path="stats" element={<StatsPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="more" element={<Navigate to={loadSession()?.user.role === "TEACHER" ? "/payments" : "/"} replace />} />
        <Route path="essays" element={<EssaysPage />} />
        <Route path="lessons/:id" element={<LessonEditorPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="tests" element={<TestsPage />} />
        <Route path="tests/:id" element={<TestEditorPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="parents" element={<ParentsPage />} />
        <Route
          path="payments"
          element={
            <RequireAuth teacher>
              <PaymentsPage />
            </RequireAuth>
          }
        />
        <Route
          path="billing"
          element={
            <RequireAuth teacher>
              <BillingSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="staff"
          element={
            <RequireAuth teacher>
              <StaffPage />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
