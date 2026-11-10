import { ERROR_TYPES, ESSAY_RUBRIC, RUBRIC_STEPS, type ErrorTypeKey } from "@onatili/shared";
import { request } from "node:https";
import { z } from "zod";

export interface AiEssayResult {
  /** Esse tekshirilmaydigan holat (AI aniqlaydi): mavzuga mos emas, ko'chirilgan, faqat kirish qismi */
  special: "OFF_TOPIC" | "COPIED" | "ONLY_INTRO" | null;
  criteria: { key: string; score: number; comment: string | null }[];
  feedback: string;
  mistakes: { wrong: string; right: string; note: string | null; type: ErrorTypeKey }[];
  /** Aniq tavsiyalar: eng zaif bandlar bo'yicha, o'quvchining o'z jumlasi yaxshilangan namunasi bilan */
  tips: { focus: string | null; text: string; example: string | null }[];
}

/** DeepSeek (OpenAI bilan mos API). IPv4 majburiy: serverda IPv6 ishlamaydi. */
function postJson(host: string, path: string, apiKey: string, body: object, timeoutMs: number): Promise<{ status: number; json: unknown }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host,
        path,
        method: "POST",
        family: 4,
        timeout: timeoutMs,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), authorization: `Bearer ${apiKey}` },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, json: null });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("AI timeout")));
    req.on("error", reject);
    req.end(data);
  });
}

const resultSchema = z.object({
  special: z.enum(["OFF_TOPIC", "COPIED", "ONLY_INTRO"]).nullish().catch(null),
  criteria: z.array(z.object({ key: z.string(), score: z.coerce.number(), comment: z.string().nullish() })).default([]),
  feedback: z.string().default(""),
  mistakes: z.array(z.object({ wrong: z.string(), right: z.string(), note: z.string().nullish(), type: z.string().nullish() })).default([]),
  tips: z.array(z.object({ focus: z.string().nullish(), text: z.string(), example: z.string().nullish() })).default([]).catch([]),
});

const TYPE_KEYS = ERROR_TYPES.map((t) => t.key as string);
/** AI tur bermasa yoki noto'g'ri bersa: izohdagi kalit so'zdan aniqlaymiz */
function mistakeType(type: string | null | undefined, note: string | null | undefined): ErrorTypeKey {
  if (type && TYPE_KEYS.includes(type)) return type as ErrorTypeKey;
  const n = (note ?? "").toLowerCase();
  if (n.startsWith("imlo") || n.includes("tutuq")) return "spelling";
  if (n.startsWith("punkt") || n.includes("vergul") || n.includes("tinish")) return "punctuation";
  if (n.startsWith("qo'shimcha") || n.includes("qo'shimcha")) return "affix";
  if (n.startsWith("so'z")) return "word";
  if (n.includes("uslub")) return "style";
  return "other";
}

/** Rasmiy mezon (BBA) va "Yozma ishni baholashga qo'yiladigan talablar" asosida ko'rsatma */
export function buildEssayPrompt(topic: string, text: string, handwritten = false) {
  const rubric = ESSAY_RUBRIC.map(
    (c, i) => `${i + 1}. "${c.key}" — ${c.label} (${c.group}):\n${c.levels.map((l, j) => `   ${RUBRIC_STEPS[j]} ball: ${l}`).join("\n")}`,
  ).join("\n");
  const system = `Sen Bilim va malakalarni baholash agentligining ona tili va adabiyot fanidan tajribali fan ekspertisan. Milliy sertifikat imtihonidagi yozma ish (esse)ni RASMIY MEZON bo'yicha xolis baholaysan.

MEZON: 12 ta band, har biri faqat 2, 1.5, 1, 0.5 yoki 0 ball (jami 24). Har bir band uchun quyidagi tavsiflardan eng mosini tanla:
${rubric}

BAHOLASH QOIDALARI (rasmiy talablar):
- Uslub: boshqa uslub elementlari matnning uchdan bir qismigacha uchrasa "chekinilgan" (1.5), uchdan ikki qismida uchrasa "qisman publitsistik" (1).
- Qarashlar: vaziyat yuzasidan ikki xil qarash va talabgorning shaxsiy qarashi asosiy qismda yoritilishi kerak. Faqat shaxsiy mulohaza bo'lib, qarashlar yoritilmasa — 0.
- Dalillar: keltirilgan faktlarning (sana, nom, manba) to'g'riligi tekshirilmaydi, faqat qarashni asoslashga xizmat qilishi baholanadi.
- Qismlar: "faqat bittasi" deganda asosiy qism yoki xulosa nazarda tutiladi (kirish emas).
- Xatboshilarga ajratishdagi xato mantiqiy qurilish xatosi (5-band); ayni bir fikrning takrori (boshqa so'zlar bilan bo'lsa ham) izchillik buzilishi (6-band).
- Imlo: harflar imlosi, tutuq belgisi, asos va qo'shimchalar, qo'shib/ajratib/chiziqcha bilan yozish, bosh harflar, ko'chirish. Bir xil xato bir necha joyda takrorlansa — BITTA xato. Bitta so'zdagi bir nechta xato — BITTA xato. Kirill harflari bilan yozilgan so'z — imlo xatosi. Ikki xil yozilishi me'yorda bo'lgan so'zlar (oktabr/oktyabr) va neologizmlarning ikki xilligi xato emas.
- Punktuatsiya: bitta qoida bo'yicha takrorlangan xatolar — BITTA xato; bitta gapda turli qoidalarga oid xatolar — alohida-alohida.
- Qo'shimcha qo'llash xatosi (9-band): so'z yasovchi/shakl yasovchi qo'shimchani noo'rin, almashtirib, ortiqcha qo'llash yoki tushirib qoldirish.
- So'z qo'llash xatosi (10-band): so'zni noto'g'ri, ortiqcha, noo'rin takror qo'llash, tushirib qoldirish, paronimlarni almashtirish, bog'lovchi vositalar xatosi. Neologizmlar xato emas.
- Husnixat baholanmaydi. Talabgor o'zi o'chirib/qavsga olib tuzatgan joylar xato hisoblanmaydi.

USLUB VA IBORALAR (ustozning talabi: "Qanday gapirsangiz, shunday yozmang"):
- So'zlashuv uslubidagi jumlalarni ALOHIDA qidir va "style" bandida hisobga ol. Belgilari: kundalik nutq qoliplari ("hozirgi kunda", "ko'p odamlar o'ylaydiki", "buning yomon tomoni ham bor", "menimcha", "xullas", "bilasizmi"), kuchaytiruvchi so'zlashuv so'zlari ("juda-juda", "zo'r", "rosa"), "-da", "-ku", "-yu" kabi jonli nutq yuklamalari, o'quvchiga gapirgandek murojaat, aniq bo'lmagan umumiy gaplar.
- Publitsistik uslub: fikr jamoatchilikka qaratilgan, masalaning dolzarbligi va ijtimoiy ahamiyati ta'kidlanadi, umumlashtiriladi, ta'sirchan va aniq ifodalanadi. Namunalar:
  ❌ "Hozirgi kunda bu muammo juda muhim bo'lib qoldi." → ✅ "Bugun ushbu masala kun tartibidagi eng dolzarb muammoga aylandi."
  ❌ "Ko'p odamlar o'ylaydiki, telefon bolalarga zarar qiladi." → ✅ "Keng jamoatchilik orasida smartfonlarning yosh avlod tarbiyasiga salbiy ta'sir ko'rsatishi haqida haqli xavotirlar bor."
  ❌ "Buning yomon tomoni ham bor…" → ✅ "Biroq ushbu qulaylik ortida jiddiy xavf-xatarlar yashiringanini ham unutmaslik zarur."
- Publitsistik uslubdan chekinishning uch ko'rinishi bor, uchalasi ham "style" bandida hisobga olinadi. Bitta fikr misolida:
  ❌ So'zlashuv: "Do'xtirlarning ishini kamaytirish kerak, bo'lmasa, charchab xato qilib qo'yadi." (jo'n, kundalik muloqot tili)
  ❌ Ilmiy: "Tibbiyot xodimlarining kasbiy zo'riqish koeffitsiyentini pasaytirish maqsadida mehnat resurslarini ratsional taqsimlash talab etiladi." (o'ta murakkab, quruq atamalar)
  ❌ Rasmiy-idoraviy (kanselyarizm — ENG KO'P uchraydigan xato): "Shifokorlarning ish soatlarini qisqartirish bo'yicha tegishli chora-tadbirlar ishlab chiqilishi hamda amaliyotga joriy etilishi maqsadga muvofiqdir." (hisobot yoki majlis bayonnomasi tili: "tegishli chora-tadbirlar", "maqsadga muvofiq", "joriy etilishi", "ta'minlash yuzasidan", "mazkur")
  ✅ Publitsistik: "… shifokor manfaati va bemor ehtiyoji o'rtasidagi oltin muvozanatni ta'minlashni talab etadi." (ta'sirchan, o'yga toldiruvchi, keng ommaga tushunarli)
  "Jiddiy yozaman" deb kanselyarizmga o'tib ketgan jumlalarni ham so'zlashuv jumlalari kabi topib, "style" tavsiyasida publitsistik variantini ko'rsat.
- Publitsistik iboralar va bog'lovchi jumlalar ("hal qiluvchi ahamiyat kasb etadi", "muammoning ildiziga e'tibor qaratsak", "ijtimoiy tarmoqlar qamrovi kengaygan bir paytda", "bu fikr munozaralarga sabab bo'lishi tabiiy") o'rinli ishlatilsa — "lexicon" bandida ijobiy baholanadi.
KIRISH QISMI (ustozning talabi: "kirish — essening yuzi"). To'la yoritilgan kirish 3 qadamdan iborat bo'ladi:
  1) Mavzuni ochish: muammoning jamiyatdagi dolzarbligi o'z so'zlari bilan tushuntiriladi. "Mening fikrimcha…" deb boshlash yoki vaziyat matnidagi savolni shundayicha ko'chirish — kamchilik.
  2) Ikki xil qarashga qisqacha ishora ("Bir guruh … deb hisoblasa, boshqalar … xavotirda").
  3) Oxirida tezis — tayanch fikr, u asosiy qismga mantiqiy o'tish zamini bo'ladi.
  Namuna: "Bugun … masalasi jamoatchilik va mutaxassislar o'rtasida qizg'in muhokamalarga sabab bo'lmoqda. Bir guruh tahlilchilar … deb hisoblasa, boshqalar … xavotirda. Aslida, bu ziddiyatli vaziyat … o'rtasidagi muvozanatni ta'minlashni talab etadi."
  Kirishda shu qadamlardan ikkitasi yoki uchtasi yo'q bo'lsa, u "yuza yoritilgan" hisoblanadi ("parts" bandi) va "focus": "parts" tavsiyasida o'quvchining o'z mavzusi uchun 3 qadamli kirish namunasini "example" da yoz.
ASOSIY QISM (ustozning talabi: "essening yuragi"). Asosiy qismda avval har ikki qarash dalillanadi, so'ng shaxsiy fikr asoslanadi. Faqat his-tuyg'uga tayanib yozilgan asosiy qism — katta kamchilik. Kuchli xatboshi 3 qadamdan iborat:
  1) Da'vo — xatboshining bosh g'oyasi;
  2) Dalil — qonuniyat, fakt, statistika, manba yoki sabab-oqibat ("JSST ma'lumotlariga ko'ra…", "OAVda bot-bot yoritiladigan holat…");
  3) Tahlil — dalil muammoni qanday hal qilishini tushuntirish ("Tetik shifokor qisqa vaqt ichida bemorga aniq va sifatli tashxis qo'ya oladi").
  Qarash xatboshisida dalil yo'q yoki tahlil yo'q bo'lsa, buni "evidence" va "views" bandlarida hisobga ol va "focus": "evidence" tavsiyasida o'quvchining o'z da'vosi uchun Dalil + Tahlil qadamlari yozilgan namunani "example" da ber.
  QARSHI TOMON ham xuddi shu qolipda, xuddi shunday ishonchli dalillanishi shart. Faqat bir tomon dalillangan, ikkinchisi bir jumla bilan o'tilgan bo'lsa — "views" bandida "qarashlarning bittasi to'la yoritilgan" (1 ball)dan yuqori berma.
  HAYOTIY MANTIQ DALIL O'RNIDA O'TADI: statistika yoki manba bo'lmasa ham, izchil sabab-oqibat zanjiri ("charchoq → diqqat susayishi → xato tashxis → jamiyat zarari") to'laqonli dalil hisoblanadi. Statistika yo'qligi uchun ball kamaytirma; zanjir uzilgan yoki faqat his-tuyg'u bo'lsa kamaytir. Tavsiyada fakt va iqtibos dalilni yanada kuchaytirishini eslatib o'tish mumkin.
SHAXSIY FIKR (asosiy qism oxirida). Faqat "Menimcha…", "O'ylaymanki…" bilan berilgan, dalilsiz fikr — oddiy bayon darajasi; haddan ortiq "men"lashtirish matn salmog'ini tushiradi. Kuchli shaxsiy fikr: 1) silliq o'tish ("Masalaning har ikki tomonini qiyoslagan holda aytishim mumkinki…"); 2) qat'iy pozitsiya ("to'liq qo'llab-quvvatlayman"); 3) dalillangan yechim — qarshi tomon ko'rsatgan asosli muammoni hal qilish sharti ham aytiladi ("…qo'shimcha shtat birliklarini ochish bilan hamohang kechishi kerak"). Shu uch qadam bo'lmasa, "views" bandida shaxsiy fikr "to'la yoritilgan" deb hisoblama.
XULOSA (yo'riqnomaning maxsus talabi). Xulosada talabgor yoqlayotgan qarashning JAMIYAT HAYOTIGA ta'siri yoritilishi shart. Faqat yuqoridagi fikrlarning takrori ("Xulosa qilib, men … qo'llab-quvvatlayman, bu orqali … asraladi") — "parts" bandida xulosa "yuza yoritilgan". Kuchli xulosa: 1) keng qamrov — bitta soha muammosidan jamiyat/millat darajasiga chiqish ("Mohiyatan olib qaraganda, … butun millat salomatligiga daxldor"); 2) muvozanat — ikki tomon manfaati bir jumlada ("… qanchalik ahamiyatli bo'lsa, … ham shunchalik qadrlidir"); 3) yakuniy hukm — kirishdagi tezis tasdig'ini topadi ("Shunday ekan, … orqaligina ko'zlangan natijani beradi"). Xulosa yuza bo'lsa, "focus": "parts" tavsiyasida o'quvchining mavzusi uchun shu 3 qadamli xulosa namunasini "example" da yoz.
- ME'YOR: ibora ziravorga o'xshaydi. Bitta xatboshida 3 va undan ortiq tayyor ibora qalashtirilgan bo'lsa yoki iboralar fikrsiz, shunchaki bezak uchun tiqilgan bo'lsa — matn sun'iylashadi: "lexicon" bandini "ayrim o'rinlarda noo'rin" (1 ball) yoki undan past baholab, izohda qaysi xatboshida ortiqcha ekanini ayt. Xatboshiga 1–2 ta o'rinli ibora — me'yor.

ESSE TEKSHIRILMAYDIGAN HOLATLAR ("special"):
- "OFF_TOPIC": esse mavzuga umuman mos emas (asosiy qism yoki xulosada mavzuga mos kamida bitta jumla bo'lsa — mos deb qaraladi);
- "COPIED": esse boshqa manbadan ko'chirilgan yoki vaziyat matni aynan ko'chirilgan;
- "ONLY_INTRO": faqat kirish qismi yozilgan.
Bunday holatda "special" ga shu qiymatni yoz, aks holda null.

YAKUNIY TEKSHIRUV (ustozning ro'yxati — baholashda va tavsiyalarda shu savollarga javob ber):
1) Hajm 100 so'zdan oshganmi? Xatboshilar to'g'ri ajratilganmi? (100 so'zdan kam bo'lsa, "parts" va "structure" izohida ayt.)
2) Kirish: mavzu shartdan ko'chirilmay o'z so'zi bilan ochilganmi? Ikki qarashga ishora bormi? Tezis bormi?
3) Asosiy qism: yoqlovchi fikr alohida xatboshida da'vo → dalil → tahlil bilan yozilganmi? Qarshi fikr ham xuddi shunday ishonchli dalillanganmi? Shaxsiy fikrda aniq yechim yoki taklif bormi? Xatboshilar orasida mantiqiy ko'prik bormi?
4) Xulosa: kirish takrorlanmay, yangicha xulosa yozilganmi? Pozitsiyaning jamiyatga ta'siri yoritilganmi?
5) Savodxonlik: imlo; kiritma, bog'lovchi va uyushiq bo'laklarda vergul.
6) Uslub va til sofligi: matn to'liq publitsistikmi? Bitta fikr turli so'zlar bilan takrorlanmaganmi (izchillik, 6-band)? Sheva, qo'pol yoki yot so'zlar yo'qmi?

JAVOB (faqat JSON):
{"special": null, "criteria": [{"key": "style", "score": 1.5, "comment": "..."}, ... 12 ta band ...], "feedback": "...", "tips": [{"focus": "evidence", "text": "...", "example": "..."}, ... 3–5 ta ...], "mistakes": [{"wrong": "...", "right": "...", "type": "spelling|punctuation|affix|word|style|logic|other", "note": "qisqa qoida"}]}
"tips" MAJBURIY: "special" null bo'lsa, kamida 3 ta tavsiya bo'lishi shart, bo'sh qoldirma.
- "comment": har bir bandga 1–2 jumla, xatolar sonini ko'rsat (masalan, "imlo xatosi 3 o'rinda").
- "feedback": ekspert taqrizi — 3–5 jumlali xulosa va yaxshilash bo'yicha aniq maslahat.
- "tips": 3–5 ta ANIQ tavsiya — eng past ball olgan bandlardan boshlab. "focus" — band kaliti (style, views, evidence, parts, structure, coherence, spelling, punctuation, affixes, wordUsage, lexicon, purity). "text" — nima qilish kerakligi (1–2 jumla, umumiy gap emas: aynan shu essega tegishli). "example" — o'quvchi essesidagi bitta jumlaning yaxshilangan namunasi yoki shu esse uchun yozilishi mumkin bo'lgan namunaviy jumla (masalan, kirish, dalil yoki xulosa jumlasi); kerak bo'lmasa null.
  Esseda so'zlashuv uslubidagi jumla bo'lsa, tavsiyalardan BITTASI albatta "focus": "style" bo'lsin: "text" da o'quvchining o'sha jumlasini aynan keltir ("So'zlashuv uslubi: «...»"), "example" da uning publitsistik uslubdagi varianti. Iboralar qalashtirilgan bo'lsa, "focus": "lexicon" tavsiyasida qaysilarini olib tashlash kerakligini ayt.
- "mistakes": eng muhim xatolar (ko'pi bilan 15 ta). "wrong" — matndan AYNAN ko'chirilgan qism (1–4 so'z, keyin varoqdan topiladi), "right" — to'g'risi. "type": spelling (imlo), punctuation (tinish belgisi), affix (qo'shimcha), word (so'z qo'llash), style (uslub), logic (mantiq/izchillik), other. "wrong" va "right" bir xil bo'lmasin; ishonching komil bo'lmasa kiritma.
Barcha izohlar o'zbek tilida (lotin).`;
  const note = handwritten
    ? "\n\nEslatma: matn talabgorning qo'lyozmasidan avtomatik o'qib olingan. [?] — o'qib bo'lmagan so'z: uni xato deb hisoblama, ball kamaytirma."
    : "";
  const user = `Esse mavzusi (vaziyat): ${topic}\n\nEsse matni:\n"""\n${text}\n"""${note}`;
  return { system, user };
}

export async function gradeEssayDeepSeek(opts: { apiKey: string; model: string; topic: string; text: string; handwritten?: boolean }): Promise<AiEssayResult> {
  const { system, user } = buildEssayPrompt(opts.topic, opts.text, opts.handwritten);
  const r = await postJson(
    "api.deepseek.com",
    "/chat/completions",
    opts.apiKey,
    {
      model: opts.model,
      temperature: 0.2,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    120_000,
  );
  const j = r.json as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
  if (r.status !== 200) throw new Error(`DeepSeek ${r.status}: ${j?.error?.message ?? "javob yo'q"}`);
  const content = j?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek bo'sh javob qaytardi");
  const result = normalize(resultSchema.parse(parseFirstJson(content)));
  // Model ba'zan ballda xato borligini ko'rsatib, ro'yxatni bo'sh qaytaradi: unda faqat xatolarni alohida so'raymiz
  const errorBands = ["spelling", "punctuation", "affixes", "wordUsage"];
  if (!result.special && !result.mistakes.length && result.criteria.some((c) => errorBands.includes(c.key) && c.score < 2)) {
    result.mistakes = await listMistakesDeepSeek(opts).catch(() => []);
  }
  // Tavsiyalar tushib qolsa: band izohlari asosida alohida so'raymiz (o'quvchi uchun eng kerakli qism)
  if (!result.special && !result.tips.length) {
    result.tips = await listTipsDeepSeek(opts, result.criteria).catch(() => []);
  }
  return result;
}

/** Faqat tavsiyalar (asosiy javobda tushib qolganda): eng past ball olgan bandlardan boshlab */
async function listTipsDeepSeek(opts: { apiKey: string; model: string; topic: string; text: string }, criteria: AiEssayResult["criteria"]): Promise<AiEssayResult["tips"]> {
  const weak = [...criteria].sort((a, b) => a.score - b.score).slice(0, 6).map((c) => `- ${c.key} (${c.score} ball): ${c.comment ?? ""}`).join("\n");
  const system = `Sen ona tili fan ekspertisan. Esse allaqachon mezon bo'yicha baholangan; endi o'quvchiga 3–5 ta ANIQ tavsiya yoz — eng past ball olgan bandlardan boshlab.
Har tavsiya shu essega tegishli bo'lsin, umumiy gap emas. "focus" — band kaliti (style, views, evidence, parts, structure, coherence, spelling, punctuation, affixes, wordUsage, lexicon, purity).
"text" — nima qilish kerakligi (1–2 jumla). "example" — o'quvchi essesidagi bitta jumlaning yaxshilangan namunasi yoki shu esse uchun namunaviy jumla (kirish, dalil, xulosa); kerak bo'lmasa null.
So'zlashuv yoki rasmiy-idoraviy (kanselyarizm) jumla bo'lsa, bittasi "style": "text" da o'sha jumlani aynan keltir, "example" da publitsistik varianti. Kirish yoki xulosa yuza bo'lsa, "parts": 3 qadamli namuna. Dalil yo'q bo'lsa, "evidence": da'vo → dalil → tahlil namunasi.
Javob faqat JSON: {"tips": [{"focus": "...", "text": "...", "example": "..."}]}. O'zbek tilida (lotin).`;
  const r = await postJson(
    "api.deepseek.com",
    "/chat/completions",
    opts.apiKey,
    {
      model: opts.model,
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Esse mavzusi: ${opts.topic}\n\nBaholash natijasi (eng zaif bandlar):\n${weak}\n\nEsse matni:\n"""\n${opts.text}\n"""` },
      ],
    },
    90_000,
  );
  const j = r.json as { choices?: { message?: { content?: string } }[] } | null;
  const content = j?.choices?.[0]?.message?.content;
  if (r.status !== 200 || !content) return [];
  return normalize(resultSchema.parse({ criteria: [], ...(parseFirstJson(content) as object) })).tips;
}

/** Faqat xatolar ro'yxati (asosiy javobda tushib qolganda) */
async function listMistakesDeepSeek(opts: { apiKey: string; model: string; topic: string; text: string }): Promise<AiEssayResult["mistakes"]> {
  const system = `Sen ona tili fan ekspertisan. Esse matnidagi imlo, punktuatsiya, qo'shimcha va so'z qo'llash xatolarini top.
Bir xil xato takrorlansa — bitta. Faqat aniq xatolar, ko'pi bilan 15 ta.
Javob faqat JSON: {"mistakes": [{"wrong": "matndan AYNAN ko'chirilgan 1–4 so'z", "right": "to'g'risi", "type": "spelling|punctuation|affix|word|style|logic|other", "note": "qisqa qoida"}]}
"wrong" va "right" bir xil bo'lmasin. Izohlar o'zbek tilida (lotin).`;
  const r = await postJson(
    "api.deepseek.com",
    "/chat/completions",
    opts.apiKey,
    {
      model: opts.model,
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Esse matni:\n"""\n${opts.text}\n"""` },
      ],
    },
    90_000,
  );
  const j = r.json as { choices?: { message?: { content?: string } }[] } | null;
  const content = j?.choices?.[0]?.message?.content;
  if (r.status !== 200 || !content) return [];
  return normalize(resultSchema.parse({ criteria: [], ...(parseFirstJson(content) as object) })).mistakes;
}

/**
 * Model ba'zan JSON'dan keyin (yoki oldin) qo'shimcha matn yozadi: birinchi to'liq {...} obyektini ajratib olamiz.
 * Satr ichidagi qavslar va qochirilgan qo'shtirnoqlar hisobga olinadi.
 */
export function parseFirstJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    if (start < 0) throw new Error("AI javobida JSON yo'q");
    let depth = 0;
    let inStr = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (ch === "\\") i++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
    throw new Error("AI javobidagi JSON to'liq emas");
  }
}

/** Mezon kalitlari va ball qadamlari bizning jadval bo'yicha tekshiriladi (AI'ga to'liq ishonilmaydi) */
export function normalize(raw: z.input<typeof resultSchema>): AiEssayResult {
  const r = resultSchema.parse(raw);
  const criteria = ESSAY_RUBRIC.map((c) => {
    const got = r.criteria.find((x) => x.key === c.key);
    const score = Math.max(0, Math.min(c.max, Math.round((got?.score ?? 0) * 2) / 2));
    return { key: c.key as string, score, comment: got?.comment?.trim() || null };
  });
  return {
    special: r.special ?? null,
    criteria,
    feedback: r.feedback.trim(),
    mistakes: r.mistakes
      // AI ba'zan to'g'ri so'zni "xato" deb ko'rsatadi: bir xil juftliklar olib tashlanadi
      .filter((m) => m.wrong.trim() && m.wrong.trim().toLowerCase() !== m.right.trim().toLowerCase())
      .slice(0, 15)
      .map((m) => ({ wrong: m.wrong.slice(0, 200), right: m.right.slice(0, 200), note: m.note?.slice(0, 300) || null, type: mistakeType(m.type, m.note) })),
    tips: r.tips
      .filter((t) => t.text.trim())
      .slice(0, 5)
      .map((t) => ({
        focus: t.focus && ESSAY_RUBRIC.some((c) => c.key === t.focus) ? t.focus : null,
        text: t.text.trim().slice(0, 500),
        example: t.example?.trim().slice(0, 500) || null,
      })),
  };
}

/** Oddiy matnli javob (hisobotlar uchun) */
export async function deepseekText(opts: { apiKey: string; model: string; system: string; user: string; maxTokens?: number }): Promise<string> {
  const r = await postJson(
    "api.deepseek.com",
    "/chat/completions",
    opts.apiKey,
    {
      model: opts.model,
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    },
    90_000,
  );
  const j = r.json as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
  if (r.status !== 200) throw new Error(`DeepSeek ${r.status}: ${j?.error?.message ?? "javob yo'q"}`);
  const content = j?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("DeepSeek bo'sh javob qaytardi");
  return content;
}
