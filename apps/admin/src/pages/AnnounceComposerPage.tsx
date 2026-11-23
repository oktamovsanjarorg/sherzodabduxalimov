import { ANNOUNCE_CAPTION_MAX, type AnnounceAudience, type AnnounceInput } from "@onatili/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, FlaskConical, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AudiencePicker } from "../components/announce/AudiencePicker";
import { MessageEditor } from "../components/announce/MessageEditor";
import { SendDialog } from "../components/announce/SendDialog";
import { TelegramPreview } from "../components/announce/TelegramPreview";
import { Field, MobileBar, PageHeader, Spinner, Toggle } from "../components/ui";
import { errMsg } from "../lib/api";
import { announceApi } from "../lib/announce-api";
import { useToast } from "../lib/toast";

/** O'quvchi ilovasidagi sahifalar: tugma bosilganda shu sahifa ochiladi */
const APP_PAGES: [string, string][] = [
  ["app:/", "Bosh sahifa"],
  ["app:/lessons", "Darslar"],
  ["app:/tests", "Testlar"],
  ["app:/mocks", "Sinov imtihonlari"],
  ["app:/essays", "Esselar"],
  ["app:/subscribe", "To'lov / obuna"],
  ["app:/my-attendance", "Davomat"],
  ["app:/stats", "Natijalar"],
];
type ButtonKind = "none" | "app" | "link";
const EMPTY: AnnounceInput = {
  title: "",
  text: "",
  photoFileId: null,
  buttonText: null,
  buttonUrl: null,
  silent: false,
  audience: {
    roles: ["STUDENT"],
    groupIds: [],
    modes: [],
    onlyAccepted: true,
    userIds: [],
  },
};

/** E'lon yozish: kimga, nima (matn, rasm, tugma), sinov, qoralama va yuborish (hozir yoki vaqt belgilab) */
export function AnnounceComposerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ["announcement", id],
    queryFn: () => announceApi.get(id!),
    enabled: !!id,
  });
  const [f, setF] = useState<AnnounceInput>(EMPTY);
  const [names, setNames] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [kind, setKind] = useState<ButtonKind>("none");
  const [sending, setSending] = useState(false);
  const set = (p: Partial<AnnounceInput>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    const a = existing.data;
    if (!a) return;
    if (a.status === "SENT") return void navigate(`/announcements/${a.id}`, { replace: true });
    setF({
      title: a.title ?? "",
      text: a.text,
      photoFileId: a.photoFileId,
      buttonText: a.buttonText,
      buttonUrl: a.buttonUrl,
      silent: a.silent,
      audience: a.audience,
    });
    setKind(!a.buttonUrl ? "none" : a.buttonUrl.startsWith("app:") ? "app" : "link");
    if (a.photoFileId) announceApi.photoUrl(a.photoFileId).then(setPhoto, () => setPhoto(null));
  }, [existing.data, navigate]);

  const preview = useQuery({
    queryKey: ["announce-preview", f.audience],
    queryFn: () => announceApi.preview(f.audience),
    enabled: f.audience.roles.length > 0 || f.audience.userIds.length > 0,
  });
  const upload = useMutation({
    mutationFn: async (file: File) => ({
      file,
      r: await announceApi.uploadPhoto(file),
    }),
    onSuccess: ({ file, r }) => {
      set({ photoFileId: r.fileId });
      setPhoto(URL.createObjectURL(file));
      toast("Rasm yuklandi (namunasi Telegram'ingizga yuborildi)");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const payload = (): AnnounceInput => ({
    ...f,
    buttonText: kind === "none" ? null : f.buttonText,
    buttonUrl: kind === "none" ? null : f.buttonUrl,
  });
  const save = async () => {
    const a = id ? await announceApi.update(id, payload()) : await announceApi.create(payload());
    qc.invalidateQueries({ queryKey: ["announcements"] });
    return a;
  };
  const draft = useMutation({
    mutationFn: save,
    onSuccess: (a) => {
      toast("Qoralama saqlandi");
      if (!id) navigate(`/announcements/${a.id}/edit`, { replace: true });
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const test = useMutation({
    mutationFn: () => announceApi.test(payload()),
    onSuccess: () => toast("Sinov xabari Telegram'ingizga yuborildi"),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const send = useMutation({
    mutationFn: async (at: string | null) => announceApi.send((await save()).id, at),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast(
        a.status === "SCHEDULED" && a.scheduledAt && new Date(a.scheduledAt).getTime() > Date.now() + 60_000 ? "E'lon rejalashtirildi" : "E'lon yuborilmoqda",
      );
      navigate(`/announcements/${a.id}`);
    },
    onError: (e) => toast(errMsg(e), "error"),
  });

  if (id && existing.isPending) return <Spinner className="text-ink-4" />;
  const busy = draft.isPending || send.isPending || upload.isPending;
  const tooLong = !!f.photoFileId && f.text.length > ANNOUNCE_CAPTION_MAX;
  const ready = f.text.trim().length > 0 && !tooLong && (kind === "none" || (!!f.buttonText?.trim() && !!f.buttonUrl));
  const reach = preview.data?.reachable ?? 0;

  const actions = (compact = false) => (
    <>
      <button className="btn-secondary" disabled={!ready || busy || test.isPending} onClick={() => test.mutate()} title="Faqat o'zingizga">
        <FlaskConical size={16} /> {compact ? "Sinov" : "Menga sinov"}
      </button>
      <button className="btn-secondary" disabled={!f.text.trim() || busy} onClick={() => draft.mutate()}>
        <Save size={16} /> Qoralama
      </button>
      <button className="btn-primary" disabled={!ready || busy || !reach} onClick={() => setSending(true)}>
        <Send size={16} /> Yuborish{reach ? ` (${reach})` : ""}
      </button>
    </>
  );

  return (
    <>
      <PageHeader
        title={id ? "E'lonni tahrirlash" : "Yangi e'lon"}
        subtitle="Xabar bot orqali har kimning Telegram'iga boradi"
        actions={<div className="hidden gap-2 md:flex">{actions()}</div>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="card space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-extrabold">1. Kimga</h2>
            <AudiencePicker
              value={f.audience}
              onChange={(audience: AnnounceAudience) => set({ audience })}
              preview={preview.data}
              names={names}
              onName={(k, v) => setNames((n) => ({ ...n, [k]: v }))}
            />
          </section>
          <section className="card space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-extrabold">2. Xabar</h2>
            <Field label="Sarlavha (ixtiyoriy)" hint="Faqat ro'yxatda ko'rinadi, oluvchilarga yuborilmaydi">
              <input
                className="input"
                value={f.title ?? ""}
                maxLength={120}
                placeholder="Masalan: Dekabr jadvali"
                onChange={(e) => set({ title: e.target.value })}
              />
            </Field>
            <MessageEditor
              text={f.text}
              onText={(text) => set({ text })}
              photo={photo}
              uploading={upload.isPending}
              onPhoto={(file) => upload.mutate(file)}
              onRemovePhoto={() => (set({ photoFileId: null }), setPhoto(null))}
            />
          </section>
          <section className="card space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-extrabold">3. Qo'shimcha</h2>
            <ButtonEditor kind={kind} setKind={setKind} f={f} set={set} />
            <Toggle
              checked={f.silent}
              onChange={(silent) => set({ silent })}
              label="Ovozsiz yuborish"
              hint="Telefonda tovush chiqmaydi (kechqurun yoki muhim bo'lmagan xabarlar uchun)"
            />
          </section>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-3">Ko'rinishi</h2>
          <TelegramPreview
            text={f.text}
            photo={photo}
            buttonText={kind === "none" ? null : f.buttonText}
            buttonUrl={f.buttonUrl}
            name={preview.data?.sample[0]?.split(" ")[0]}
          />
          <Reach preview={preview.data} loading={preview.isFetching} silent={f.silent} />
        </aside>
      </div>
      <MobileBar>
        <div className="flex gap-2 [&>button]:min-w-0 [&>button]:flex-1 [&>button]:px-2">{actions(true)}</div>
      </MobileBar>
      {sending && preview.data && (
        <SendDialog
          preview={preview.data}
          initial={existing.data?.scheduledAt ?? null}
          busy={send.isPending}
          onClose={() => setSending(false)}
          onSend={(at) => send.mutate(at)}
        />
      )}
    </>
  );
}

function ButtonEditor({
  kind,
  setKind,
  f,
  set,
}: {
  kind: ButtonKind;
  setKind: (k: ButtonKind) => void;
  f: AnnounceInput;
  set: (p: Partial<AnnounceInput>) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Xabar ostida tugma">
        <select
          className="input"
          value={kind}
          onChange={(e) => {
            const k = e.target.value as ButtonKind;
            setKind(k);
            if (k === "app")
              set({
                buttonUrl: APP_PAGES[0][0],
                buttonText: f.buttonText || "Ilovani ochish",
              });
            if (k === "link")
              set({
                buttonUrl: "https://",
                buttonText: f.buttonText || "Batafsil",
              });
          }}
        >
          <option value="none">Tugmasiz</option>
          <option value="app">Ilovadagi sahifani ochadi</option>
          <option value="link">Havolani ochadi (sayt, kanal)</option>
        </select>
      </Field>
      {kind !== "none" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tugma yozuvi">
            <input className="input" value={f.buttonText ?? ""} maxLength={40} onChange={(e) => set({ buttonText: e.target.value })} />
          </Field>
          {kind === "app" ? (
            <Field label="Qaysi sahifa">
              <select className="input" value={f.buttonUrl ?? ""} onChange={(e) => set({ buttonUrl: e.target.value })}>
                {APP_PAGES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Havola" hint="https:// bilan">
              <input className="input" inputMode="url" value={f.buttonUrl ?? ""} onChange={(e) => set({ buttonUrl: e.target.value.trim() })} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function Reach({ preview, loading, silent }: { preview?: { reachable: number; noTelegram: number; sample: string[] }; loading: boolean; silent: boolean }) {
  if (!preview) return <div className="card p-4 text-sm text-ink-3">Kimga yuborilishini tanlang</div>;
  return (
    <div className="card space-y-1 p-4 text-sm">
      <p className="text-2xl font-extrabold">
        {preview.reachable} <span className="text-base font-bold text-ink-3">kishiga boradi</span> {loading && <Spinner className="inline text-ink-4" />}
      </p>
      {preview.noTelegram > 0 && <p className="text-amber-700">{preview.noTelegram} kishi botga hali kirmagan — ularga bormaydi</p>}
      {preview.sample.length > 0 && (
        <p className="text-ink-3">
          {preview.sample.join(", ")}
          {preview.reachable > preview.sample.length ? ` va yana ${preview.reachable - preview.sample.length} kishi` : ""}
        </p>
      )}
      {silent && (
        <p className="flex items-center gap-1 text-ink-3">
          <BellOff size={13} /> ovozsiz
        </p>
      )}
    </div>
  );
}
