import { MILLIY_LEVELS } from "@onatili/shared";
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
      <p className="mb-3 px-1 text-sm text-hint">Milliy sertifikat formatidagi sinov imtihonlari</p>
      <div className="card mb-4 space-y-1.5 text-sm">
        <p className="font-bold">Imtihon formati</p>
        <p className="text-hint">45 ta topshiriq · 3 soat</p>
        <ul className="list-disc space-y-0.5 pl-5 text-hint">
          <li>1–35: test (javob variantli), matn va g'azalga tayangan savollar</li>
          <li>36–44: javobni o'zingiz yozasiz (a va b qismlari alohida savol bo'lib sanaladi, shuning uchun testda savollar soni 45 dan ko'p ko'rinadi)</li>
          <li>45: esse (24 ball), ustoz tekshiradi</li>
        </ul>
        <p className="pt-1 text-xs text-hint">
          Baholash rasmiy tartibda: test qismi Rasch modeli bilan (T = 50 + 10Z, maksimal 75), esse 12 bandli mezon (24 ball) bilan baholanib 75 ballik shkalaga o'tkaziladi, umumiy ball — o'rtachasi. Daraja:{" "}
          {MILLIY_LEVELS.map((l) => `${l.code} (${l.min}+)`).join(", ")}. Oliygohga kirish bali ham ko'rsatiladi.
        </p>
      </div>
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
