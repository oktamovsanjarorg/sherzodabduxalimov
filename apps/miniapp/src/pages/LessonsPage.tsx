import { ComingSoon } from "../components/ui";

export function LessonsPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="px-1 text-xl font-extrabold">Darslar</h1>
      <p className="mb-4 px-1 text-sm text-hint">Kurslar, mavzular va videodarslar</p>
      <ComingSoon title="Darslar ro'yxati" />
    </div>
  );
}
