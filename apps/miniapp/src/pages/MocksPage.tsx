import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FullPage } from "../components/FullPage";
import { TestCard } from "../components/TestCard";
import { api } from "../lib/api";
import { useBackButton } from "../lib/hooks";
import { ListSkeleton } from "./LessonsPage";

export function MocksPage() {
  const navigate = useNavigate();
  useBackButton(() => navigate("/"));
  const mocks = useQuery({ queryKey: ["mocks"], queryFn: api.mocks });

  return (
    <FullPage>
      <h1 className="px-1 text-xl font-extrabold">Mock testlar</h1>
      <p className="mb-4 px-1 text-sm text-hint">Milliy sertifikat formatidagi sinov imtihonlari</p>
      {mocks.isPending && <ListSkeleton />}
      {mocks.data?.length === 0 && <p className="card text-center text-sm text-hint">Hozircha mock testlar yo'q</p>}
      <div className="space-y-2">
        {mocks.data?.map((t) => (
          <TestCard key={t.id} test={t} />
        ))}
      </div>
    </FullPage>
  );
}
