import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { useBackButton } from "../lib/hooks";
import { ParentGatePage } from "./ParentGatePage";

/** Profil → Ota-onam: holatni ko'rish va ikkinchi ota-onani ulash */
export function ParentsPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/profile"));
  return (
    <FullPage>
      <h1 className="mb-4 px-1 text-xl font-extrabold">Ota-onam</h1>
      <ParentGatePage embedded />
    </FullPage>
  );
}
