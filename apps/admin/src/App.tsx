import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { loadSession } from "./lib/session";
import { AttendancePage } from "./pages/AttendancePage";
import { ContentPage } from "./pages/ContentPage";
import { ParentsPage } from "./pages/ParentsPage";
import { LessonEditorPage } from "./pages/LessonEditorPage";
import { LoginPage } from "./pages/LoginPage";
import { QuestionsPage } from "./pages/QuestionsPage";
import { StaffPage } from "./pages/StaffPage";
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
        <Route index element={<ContentPage />} />
        <Route path="lessons/:id" element={<LessonEditorPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="tests" element={<TestsPage />} />
        <Route path="tests/:id" element={<TestEditorPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="parents" element={<ParentsPage />} />
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
