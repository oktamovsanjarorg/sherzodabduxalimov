# Esseni AI bilan tekshirish: tadqiqot hisoboti

Sana: 2026-11-21. Branch: `feat/essay-ai-deep`.

## Nega bu hujjat bor

Esse tekshiruvi platformaning asosiy maqsadlaridan biri. Qarorlar faqat real, o'lchangan ma'lumotga asoslanadi: sun'iy yoki soxta ma'lumot asosida xulosa chiqarilmaydi.

**Savol:** qo'lyozma esse uchun qaysi yo'l eng sifatli?
1. Bitta model rasmni olib, o'zi baholaydi.
2. Rasm modeli matnga o'giradi, matn modeli baholaydi.
3. Boshqa, yaxshiroq usul.

**Usul.** Taxminan 18 ta manbaning matni o'qildi, yana 10 ga yaqinidan qidiruv parchalari olindi. Belgilar:
- belgisiz fakt — manba matnidan o'qilgan;
- **(parcha)** — faqat qidiruv parchasidan, to'liq matn ochilmagan;
- **(ikkilamchi)** — asl manba emas, unga havola qilgan boshqa manbadan;
- **(xulosam)** — manbalar asosida mening xulosam.

## Qisqa xulosa

- **1-yo'l bizga to'g'ri kelmaydi.** Rasmdan to'g'ridan-to'g'ri baholaydigan model imlo va tinish belgilarini o'zi bilmasdan "to'g'rilab" o'qiydi va buni tekshirib bo'lmaydi. Bizda 24 balldan 8 tasi bevosita xatolar soniga qarab qo'yiladi.
- **2-yo'l to'g'ri yo'nalish, lekin bitta o'qish va bitta baholovchi yetmaydi.** Professional tizimlarda:
  - o'qish boshqa oiladagi model bilan tekshiriladi;
  - har bir xato rasmda tasdiqlanadi;
  - natija inson bahosi bilan o'lchanadi;
  - noaniq holatlar ustozga yuboriladi.
- **Eng kutilmagan topilma.** Hozir imlo xatolarini topayotgan DeepSeek-V4-Pro o'zbek imlosi bo'yicha ochiq benchmarkda (UzLiB) 0.64 olgan. Gemini 4 Carbon shu bo'limda 0.84 olgan.
- **Sifatni o'lchash uchun real sinov to'plami kerak.** Hozir tizim qanchalik to'g'ri baholashini hech kim bilmaydi.

## Hozirgi tizim (2026-11-21)

Oqim:
1. **O'qish.** Gemini qo'lyozmani matnga o'giradi (`apps/api/src/ai/gemini.ts`). Odatiy model `gemini-3.8-flash` (`apps/api/src/config/env.ts:39`). Prompt imlo xatolarini tuzatmaslikni talab qiladi (`apps/api/src/ai/gemini.ts:37`).
2. **Baholash.** DeepSeek-V4-Pro yuqori fikrlash rejimida ishlaydi (`apps/api/src/config/env.ts:35-36`). Bosqichlar:
   - A: tahlil va B: savodxonlik, parallel;
   - C: qayta tekshiruv;
   - D: taqriz.
3. **Ball.** AI ball qo'ymaydi. Ballni server xatolar soniga qarab hisoblaydi (`apps/api/src/ai/essay/scoring.ts:6`): 0 xato → 2; 1–2 → 1,5; 3–4 → 1; 5–6 → 0,5; 7+ → 0. Bu imlo, punktuatsiya, qo'shimchalar va so'z qo'llash bandlariga tegishli (jami 8 ball). Takror, til sofligi va tuzilish bandlari ham soniga qarab hisoblanadi.
4. **Belgilash.** Gemini xatolarning varoqdagi joyini topadi va u yerga belgi qo'yiladi.

Avvaldan to'g'ri qilingan narsalar:
- AI dalil yig'adi, ballni server hisoblaydi.
- `[?]` (o'qib bo'lmagan so'z) xato deb sanalmaydi (`apps/api/src/ai/essay/prompts.ts:7`).
- Ba'zi holatlarni server o'zi aniqlaydi: to'liq kirillcha, 100 so'zdan kam (`apps/api/src/essays/ai-runner.ts:85`) va vaziyat matnidan ≥50% ko'chirilgan esse (`apps/api/src/ai/essay/grade.ts:24`). Bu Texas tizimidagi "condition code" (maxsus holat belgisi) amaliyotiga o'xshaydi.
- Apostrof variantlari (ʻ ʼ ‘ ’ \` ´ ') bir xil deb solishtiriladi (`apps/api/src/ai/essay/text.ts:22`).
- O'quvchiga "Taxminiy ball" deb yuboriladi (`apps/api/src/essays/ai-runner.ts:125`).
- `docs/PLAN.md:85` da qoida bor: "AI hech qachon yakuniy baho qo'ymaydi".

## Topilmalar

### 1. Rasmdan to'g'ridan-to'g'ri baholash yoki avval matnga o'girish

- **Fizika va matematika.** Rasmdan to'g'ridan-to'g'ri baholash Mathpix OCR'dan yaxshiroq ishlagan, ayniqsa chizmalarda. Lekin mualliflar buni "dastlabki sinov" deb atagan (Donaldson va boshq., 2026). Kortemeyer (GPT-5) va Pathak (GPT-5.5) ham rasmning o'zini berib baholagan.
- **Esse imlosi uchun** "rasmdan baholash" va "avval o'qib, keyin baholash"ni bevosita solishtirgan tadqiqot topilmadi.
- **AI o'qiganda imloni standartlashtiradi:**
  - So'z darajasidagi xatolarning 39–44% i tinish belgisi, bosh harf va imloni "standartlashtirish" bo'lgan (Humphries va boshq., 2024).
  - 3 684 maydondan 870 tasini barcha o'qishlar bir xil o'qigan, lekin ulardan 7 tasi baribir xato edi. Ular orasida imloni "to'g'rilash" ham bor: Mrytle → Myrtle (Archibald & Martinez, 2025).
  - Uchta model tekshirgandan keyin qolgan 33 ta xatoning taxminan uchdan biri imloni zamonaviylashtirish edi va hamma model shunday o'qigan (Humphries, 2026).
- **Shaffoflik amaliyoti:**
  - No More Marking'da ustoz asl qo'lyozma bilan AI o'qigan matn orasida almashib ko'ra oladi.
  - AlGhamdi tadqiqotida har bir talabaga hisobot bilan birga ishining to'liq skani yuborilgan.
- **(xulosam)** Matnga o'girish shart: ustoz va o'quvchi nima o'qilganini ko'rishi kerak. Lekin imlo va tinish bo'yicha har bir qaror rasm bilan tasdiqlanishi kerak.

### 2. O'qish (OCR) sifati

- **Crosilla va boshq. (2025):**
  - Zamonaviy inglizcha qo'lyozmada xato kam: GPT-4o-mini IAM to'plamida CER 1,71%.
  - Boshqa tillarda ancha yomon: italyancha LAM to'plamida Claude 3.5 Sonnet CER 20,55%, Leopardi'da 26,43% (ikkalasi ham tarixiy qo'lyozma).
  - Ularning promptida ham "imlo va grammatikani tuzatma" talabi bor.
  - Modelning o'z o'qishini qayta tuzatishi barqaror foyda bermagan, ochiq modellarda esa xatoni ko'paytirgan.
- **Humphries va boshq. (2024):**
  - Model o'zini o'zi tuzatganda natija o'rtacha atigi ~1% o'zgargan.
  - Boshqa model tuzatganda CER 15–20%, WER 22–23% yaxshilangan.
  - Eng yaxshi juftlik: Claude Gemini o'qiganini tuzatgan. Tinish va bosh harf farqlari hisobga olinmaganda CER 4,1% gacha tushgan (−63%).
  - LLM Transkribus o'qiganini tuzatganda WER 59% kamaygan.
- **Humphries (2026):**
  - Asosiy o'qishni Gemini 3 Pro qilgan, Gemini 3.5 Flash va Claude Opus 4.7 uni solishtirgan.
  - 374 ta farq belgilangan, ulardan 106 tasi haqiqiy xato chiqqan.
  - Matnning ~4% ini ko'rib chiqish kifoya qilgan. Tinish va bosh harf farqlari hisobga olinmaganda WER 1,33% dan 0,33% ga tushgan.
  - Muallif yozishicha, avvalgi "yangi model bilan tuzatish" usuli ko'pincha tuzatganicha yangi xato qo'shgan.
- **Archibald & Martinez (2025).** Bitta modelda (Gemini 2.0 Flash) rasmning 10 ta o'zgartirilgan nusxasi o'qilib, harf bo'yicha ovoz berilgan. CER 9,0% dan 7,2% ga tushgan.
- **Gutteridge va boshq.** An'anaviy OCR matni rasm bilan birga berilganda, aksariyat to'plamlarda faqat rasmdan o'qishdan aniqroq chiqqan. Bitta sahifa rasmi ko'pincha butun hujjat qadar foyda bergan. Bu yerdagi raqamlar maqola xulosasi orqali o'qildi.
- **Aisyah va boshq. (2025), Indoneziya, 4-sinf:**
  - Ustoz ko'chirgan matnga nisbatan GPT-4o o'qigan matn bilan baholash xatosi (MAE, 0–100) ingliz tilida 7,9 dan 11,7 ga, matematikada 1,5 dan 8,2 ga oshgan.
  - Barcha AI ballarini ustoz ko'rib chiqqan.
- **Tan, Zhang, Mu (2024), Xitoy boshlang'ich sinflari.** Xom OCR matni bilan tuzatilgan matn o'rtasida baholash aniqligida katta farq chiqqan. LLM noto'g'ri javoblarga ham "harakati uchun" ball bergan. **(parcha)**
- **Rasm sifati:**
  - Kortemeyer tadqiqotida belgilangan joydan tashqarida yoki qo'shimcha varaqda yozilgan qism o'tkazib yuborilgan.
  - Xira va tebranib olingan rasmda qism tushib qolgan yoki noto'g'ri o'qilgan (arXiv 2605.19043). **(parcha)**
- **Zurich universiteti** imtihonlarda qo'lyozma OCR'dan voz kechgan: "Handwriting recognition proves particularly unreliable in exam environments".

### 3. O'zbek tiliga xos holat

- **O'zbek qo'lyozmasi uchun ochiq to'plam yoki benchmark topilmadi.**
- **Google Vision** o'zbek tilini (`uz`, lotin) "experimental" deb belgilagan, ya'ni doimiy tekshirilmaydi. **(parcha)**
- **Azure** qo'lyozmani 9 tilda o'qiydi, o'zbek tili ular orasida yo'q. **(parcha, hujjat eskiroq bo'lishi mumkin)**
- **UzLiB.** Tahrirchi jamoasining benchmarki. Asl manba: `github.com/tahrirchi/uzlib`, `LEADERBOARD.md` — raqamlarni o'zim tekshirdim.
  - 1 861 ta variantli savoldan iborat, shundan 1 501 tasi "to'g'ri yozilgan so'zni tanlash".
  - Savollar Telegram imlo kanallaridan olingan, lotin yozuvida.
  - `temperature=1.0`, `top-p=0.95` bilan o'tkazilgan. Fikrlash rejimi aytilmagan.

| Model | Umumiy | To'g'ri so'z (imlo) |
|---|---|---|
| Gemini 4 Carbon | 0.8522 | 0.8448 |
| Gemini 3 Pro | 0.8264 | 0.8215 |
| Gemini 3.7 Flash | 0.8092 | 0.8061 |
| GPT-6 Luna | 0.8087 | 0.8101 |
| Claude Sonnet 5.5 | 0.7813 | 0.7861 |
| Claude Opus 5.5 | 0.7743 | 0.7668 |
| DeepSeek V4.1 Flash | 0.7480 | 0.7548 |
| DeepSeek-V4-Flash | 0.7088 | 0.7222 |
| **DeepSeek-V4-Pro (bizdagi)** | **0.6464** | **0.6396** |
| Telegram so'rovnomasidagi odamlar | 0.5894 | 0.6054 |

  Cheklovlar:
  - Bu variantli test. Esse ichidan xato topish boshqa vazifa.
  - Biz DeepSeek'ni yuqori fikrlash rejimida ishlatamiz, benchmark esa boshqa sozlamada o'tkazilgan bo'lishi mumkin. Shuning uchun uni o'z sozlamamiz bilan qayta o'tkazish kerak.
  - `gemini-3.8-flash` jadvalda yo'q.
- **O'zbek tili uchun vositalar:**
  - `hunspell-uz` (Debian paketi);
  - `uzmorph` (~122 ming o'zak, MIT);
  - `UzMorphAnalyser` (arXiv 2405.14179).

  Bular imlo xatosi uchun qo'shimcha signal bo'lishi mumkin, lekin yakuniy hakam bo'la olmaydi: agglyutinativ tilda kam uchraydigan to'g'ri shakllar va ismlar xato deb chiqishi mumkin. **(parcha)**
- **Bosma o'zbek matni uchun ishlar:**
  - `uzocr-8b` — LoRA bilan moslashtirilgan mahalliy multimodal model (Zenodo 24140067). Qo'lyozma sinalgani aytilmagan.
  - ByT5 bilan OCR'dan keyingi tuzatish (arXiv 2611.13609): CER 5,78% dan 3,69% ga tushgan. Taqqoslangan Qwen2.5-7B esa 1 132 ta yangi xato qo'shgan, ya'ni LLM bilan tuzatish yangi xato ham qo'shadi.

### 4. Xato topishning aniqligi (GEC)

- LLM'lar ortiqcha tuzatadi: ko'p xato topadi, lekin ularning ko'pi noto'g'ri bo'ladi (POCO, arXiv 2509.20811). **(parcha)**
- Sozlanmagan holatda aniqlik ko'pincha 45% dan past (BEA-2019 to'plami, arXiv 2609.10810). **(parcha)**
- Sohada aniqlikka ikki baravar ko'p og'irlik beradigan F0.5 qo'llaniladi, chunki soxta xato o'quvchini chalg'itadi. Bir nechta natijadan kelishilgan tuzatishlarni ovoz bilan tanlash F0.5 ni oshirgan (arXiv 2605.13624). **(parcha)**
- **Bizga ta'siri:** bitta soxta imlo xatosi bandni 2 dan 1,5 ga tushiradi. Uchta soxta xato 1 gacha tushiradi.

### 5. AI baholashi qanchalik ishonchli

- **Mathew va boshq. (2026), 5 269 esse:**
  - Ikki inson orasidagi moslik (QWK) 0,72. LLM'larda ASAP to'plamida 0,30 dan past.
  - LLM qisqa esselarga ortiqcha ball bergan, uzun esselarni esa mayda imlo va grammatika xatolari uchun jazolagan.
- **EssayJudge.** Kompyuterda yozilgan esselar, mavzuga rasm qo'shilgan. GPT-4o va inson mosligi (QWK):

  | Band | GPT-4o | Inson |
  |---|---|---|
  | Lug'at aniqligi | 0,89 | 0,91 |
  | Grammatika | 0,85 | 0,93 |
  | Tinish belgilari | 0,65 | 0,86 |
  | Argument aniqligi | 0,30 | 0,72 |

  Haqiqiy baho ikki ekspertning o'rtachasi sifatida olingan, ular 1 dan ko'p farq qilsa, uchinchi ekspert hal qilgan.
  **(xulosam)** Mazmun bandlarida AI eng zaif, ustoz ko'rigi aynan shu bandlarga qaratilishi kerak.
- **Kortemeyer va boshq. (2025), GPT-5, 342 ta qo'lyozma imtihon:**
  - Filtrsiz R² ≈ 0,85, AI o'rtacha ~1 ball saxiyroq baholagan.
  - Inson darajasidagi aniqlikka yetish uchun ~70% ishni insonga yuborishga to'g'ri kelgan.
- **Pathak va boshq. (2026), GPT-5.5 Thinking, 10 364 sahifa:**
  - Umumiy ballarda moslik yuqori (r = 0,91–0,97), lekin savol qismlarida ballar faqat 63–70% hollarda aynan mos kelgan.
  - "Ishonchim yuqori" deb belgilangan qismlarda xato kam bo'lgan, lekin baribir bor edi.
  - Tavsiya: AI'ni "second reader or audit tool under examiner control" sifatida ishlatish.
- **AlGhamdi (2026), Claude Code (Opus 4.6), 60 talaba:**
  - r = 0,97; o'rtacha farq 20 balldan 0,85; AI +0,68 ball saxiy; bir haftadan keyin qayta baholashda ICC 0,96.
  - Baholovchi mulohaza talab qiladigan savollarda moslik κ = 0,65.
  - Ishlarning 76,7% i ustoz ko'rigiga yuborilgan.
  - Himoya qoidalari: ustoz ko'rmaguncha baho rasmiy hisobga kirmaydi; talaba skan va hisobotni oladi va baho yakunlanguncha kamida 5 ish kuni muddati bo'ladi; talaba shartsiz qayta tekshiruv so'rashi mumkin.
- **Bir necha marta baholab o'rtachasini olish.** Natijani barqaror qiladi, lekin AI'ning noxolisligini yo'qotmaydi. Bu boradagi dalillar qarama-qarshi. **(parcha)**

### 6. Professional tashkilotlar amaliyoti

- **ETS (GRE).** AI bahosi bitta inson bahosi bilan solishtiriladi. Farq 0,5 dan oshsa (0–6 shkala), ikkinchi inson tekshiradi. Yakuniy baho faqat inson baholaridan chiqadi. **(parcha)**
- **ETS ramkasi (Williamson, Xi, Breyer, 2012)** bo'yicha qabul me'yorlari: **(ikkilamchi)**
  - AI va inson mosligi (QWK) ≥ 0,70;
  - o'rtacha ballar farqi (SMD) ≤ 0,15;
  - AI–inson mosligi inson–inson mosligidan 0,10 dan ko'p past bo'lmasligi.
- **Texas (STAAR):** **(parcha, PDF'lar hozir 404)**
  - avval AI baholaydi, keyin kamida 25% ish insonga yuboriladi;
  - juda qisqa yoki takroriy javoblar maxsus holat sifatida insonga ketadi;
  - AI ishonchi past bo'lgan javoblarni ham inson tekshiradi;
  - inson qo'ygan baho yakuniy hisoblanadi.
- **UzBMB.** "har bir talabgorning yozma ishi kamida ikki (ayrim holatlarda uch) nafar ekspert tomonidan" tekshiriladi. **(parcha, sahifada TLS xatosi bor)**
- **No More Marking.** Qarorlarning 90% ini AI, 10% ini inson qiladi. Kompaniya ma'lumotiga ko'ra, AI inson qarorlarining 81% iga mos kelgan. **(parcha)**

## Kodda topilgan zaif joylar (tekshirildi)

1. **Qo'lyozma bir marta, bitta model bilan o'qiladi.** Uni boshqa model tekshirmaydi.
2. **Varoqda topilmagan xato ham ballni tushiradi.** Ball `apps/api/src/essays/ai-runner.ts:96` da hisoblanadi, xatoning varoqdagi joyi esa keyin, `:100` da qidiriladi va natijasi ballga ta'sir qilmaydi.
3. **"Ikkinchi ekspert" o'sha DeepSeek modelining o'zi** (`apps/api/src/ai/essay/grade.ts:73`). Tadqiqotlar bo'yicha model o'zini o'zi tekshirsa, deyarli foyda bo'lmaydi.
4. **Gemini band bo'lsa, boshqa modelga jim o'tadi** (`apps/api/src/ai/gemini.ts:60`, `:86`). Natijada faqat DeepSeek modeli saqlanadi (`grade.ts:50`), qaysi Gemini o'qigani esa saqlanmaydi.
5. **Imlo bosqichini UzLiB'da past natija ko'rsatgan model bajaradi** (DeepSeek-V4-Pro).
6. **Real sinov to'plami va o'lchash skripti yo'q.**

## Tavsiya etilgan yo'l (muhimlik tartibida)

1. **Real sinov to'plami va o'lchash skripti.**
   - Har bir esse uchun kerak: o'quvchi roziligi bilan olingan qo'lyozma rasmi, ustoz xatolari bilan aynan ko'chirgan matn va ikki ustozning mustaqil bahosi (har band bo'yicha).
   - Hajm: kamida 50 ta esse. **(xulosam, standart emas)**
   - O'lchanadigan narsalar:
     - o'qish sifati: CER va WER;
     - xato turlari bo'yicha aniqlik, to'liqlik va F0.5;
     - har band bo'yicha moslik (QWK, aynan va ±1 qadam mos kelish);
     - umumiy balldagi o'rtacha farq (MAE) va AI qaysi tomonga og'ishi (SMD);
     - ikki ustoz orasidagi moslik, solishtirish uchun asos sifatida.
   - Maqsad sifatida ETS me'yorlari olinadi. Har safar model yoki prompt o'zgarsa, to'plam qaytadan o'tkaziladi.
2. **Modelni o'lchab tanlash.**
   - Avval UzLiB "to'g'ri so'z" bo'limini bizning aniq sozlamamiz bilan o'tkazish: DeepSeek-V4-Pro yuqori fikrlash rejimida, Gemini va boshqa nomzodlar.
   - Keyin sinov to'plamida solishtirish.
   - Imlo bosqichi eng yaxshi natija bergan modelga o'tadi.
3. **Ikki xil oiladagi model bilan o'qish.**
   - Ikki model qo'lyozmani mustaqil o'qiydi, natijalar so'zma-so'z tekislanadi.
   - Kelishmagan so'z uchun rasmning o'sha qismi va ikkala variant birga ko'riladi.
   - Baribir hal bo'lmasa, so'z `[?]` deb belgilanadi va xato sifatida sanalmaydi.
4. **Har bir xato rasmda tasdiqlanadi.**
   - Qo'lyozmada xato faqat "rasmda aynan shunday yozilgan" degan tasdiqdan va ikkala o'qish ham shu shaklni ko'rsatganidan keyin sanaladi.
   - Tasdiqlanmagani ball tushirmaydi, ustozga "shubhali" deb ko'rsatiladi.
5. **Tekshiruvchi boshqa oiladan bo'ladi.** Xatoni topgan model emas, boshqa kompaniyaning modeli uni qayta ko'radi. Lug'at va morfologiya vositalari qo'shimcha signal sifatida qo'shilishi mumkin.
6. **Model versiyasi qotiriladi.**
   - Har bir natijada qaysi model (OCR, savodxonlik, tekshiruv) va qaysi prompt versiyasi ishlatilgani saqlanadi.
   - Zaxira modelga o'tilsa, natija jim saqlanmaydi, balki "qayta tekshirish kerak" deb belgilanadi.
7. **Ustoz navbati.**
   - Ustozga yuboriladi: noaniq so'zlar, chegaraga yaqin ballar, sifatsiz rasmlar va maxsus holatlar.
   - Ustoz tasdiqlamaguncha ball "taxminiy" bo'lib qoladi.
   - O'quvchi asl rasm va o'qilgan matnni ko'radi va ustozdan qayta tekshirishni so'ray oladi.
8. **Rasm sifatini tekshirish.** Xira, qorong'i, qiyshiq yoki chala sahifa darhol qaytariladi. Sahifalar tartibi tekshiriladi.
9. **Keyinchalik: o'zimizning maxsus model.** Ustoz tuzatgan matnlar va baholar yig'ilgach, ulardan o'zbek o'quvchilari qo'lyozmasi uchun maxsus model o'qitish mumkin (masalan, LoRA bilan).

## Hali noma'lum (o'lchamasdan aytib bo'lmaydi)

- O'quvchilarimizning qo'lyozmasini Gemini qanchalik xato o'qishi.
- DeepSeek-V4-Pro yuqori fikrlash rejimida UzLiB'da qancha natija ko'rsatishi.
- Ikki model kombinatsiyasi va rasmda tasdiqlash o'zbek tilida qanchalik yordam berishi.
- Hozirgi tizim ustoz bahosiga qanchalik mos kelishi.

## Keyingi qadamlar

- [ ] UzLiB "to'g'ri so'z" bo'limini bizning sozlamamiz bilan o'tkazish. Ma'lumotlar ochiq, oz miqdorda API xarajati bor. Foydalanuvchi ruxsatini kutyapti.
- [ ] O'lchash skripti: CER/WER, xatolar bo'yicha aniqlik, to'liqlik va F0.5, bandlar bo'yicha QWK, MAE va SMD.
- [ ] Real sinov to'plami (ustoz tayyorlaydi).
- [ ] So'ng tavsiya etilgan yo'lning 3–8-bandlari, har birining ta'siri sinov to'plamida o'lchanadi.

## Manbalar

- UzLiB leaderboard (Tahrirchi): https://github.com/tahrirchi/uzlib/blob/main/LEADERBOARD.md
- Humphries va boshq., Unlocking the Archives (2024): https://arxiv.org/abs/2411.03340
- Humphries, When Models Disagree (2026): https://generativehistory.substack.com/p/when-models-disagree-transcription
- Crosilla va boshq., Benchmarking LLMs for HTR (2025): https://arxiv.org/abs/2503.15195
- Archibald & Martinez, Test-Time Image Augmentations (2025): https://arxiv.org/abs/2509.09722
- Gutteridge va boshq., Judge a Book by its Cover: https://arxiv.org/abs/2502.20295
- Aisyah va boshq., Indonesian Classrooms (2025): https://arxiv.org/abs/2506.04822
- Tan, Zhang, Mu, ICCE 2024: https://library.apsce.net/index.php/ICCE/article/view/4870
- Mathew va boshq., LLMs Do Not Grade Essays Like Humans (2026): https://arxiv.org/abs/2603.23714
- EssayJudge: https://arxiv.org/abs/2502.11916
- Kortemeyer va boshq., GPT-5 calculus grading (2025): https://arxiv.org/abs/2510.05162
- Pathak va boshq., Olympiad AI grading (2026): https://arxiv.org/abs/2608.20521
- AlGhamdi, Claude Code grading (2026): https://arxiv.org/abs/2611.13217
- Donaldson va boshq., LLMs in Physics Education (2026): https://arxiv.org/abs/2605.23660
- POCO, LLM overcorrection (2025): https://www.arxiv.org/pdf/2509.20811
- Minimal-edit GEC (2026): https://arxiv.org/pdf/2609.10810
- Edit-level voting GEC (2026): https://arxiv.org/pdf/2605.13624
- ETS e-rater, GRE: https://www.ets.org/research/policy_research_reports/publications/report/2012/jdyu.html
- Williamson, Xi, Breyer (2012), ETS RM-23-01: https://www.ets.org/Media/Research/pdf/RM-23-01.pdf
- TEA hybrid scoring: https://tea.texas.gov/student-assessment/reports-and-studies/2024-staar-hybrid-scoring-study.pdf
- UzBMB rasmiy munosabat: https://www.uzbmb.uz/page/post-view/sertifikat-munosabat
- No More Marking: https://substack.nomoremarking.com/p/can-ai-solve-handwriting-bias
- UZH practical OCR: https://www.df.uzh.ch/en/studies/teaching-center/projects-and-innovation/ai-assisted-grading/knowledge-base/practical-ocr.html
- Google Vision tillari: https://docs.cloud.google.com/vision/docs/languages
- Azure OCR: https://learn.microsoft.com/azure/ai-services/computer-vision/overview-ocr
- O'zbek OCR'dan keyingi tuzatish (2026): https://arxiv.org/abs/2611.13609
- uzocr-8b (Zenodo): https://zenodo.org/records/24140067
- hunspell-uz: https://packages.debian.org/sid/hunspell-uz
- uzmorph: https://pypi.org/project/uzmorph/
- UzMorphAnalyser: https://arxiv.org/abs/2405.14179
