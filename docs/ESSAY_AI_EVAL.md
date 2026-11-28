# Esse AI tekshiruvini o'lchash

Maqsad: AI tekshiruvi ustoz bahosiga qanchalik yaqinligini **real esselarda** o'lchash. Asos: [ESSAY_AI_RESEARCH.md](ESSAY_AI_RESEARCH.md). Model yoki prompt o'zgargan har safar o'lchov qaytadan o'tkaziladi.

Ma'lumot va natijalar `eval-data/` papkasida saqlanadi. Bu papka git'ga kirmaydi, chunki unda o'quvchilarning ishlari bor (repo ochiq).

## 1. UzLiB: imlo uchun modelni tanlash

Ochiq benchmark ([tahrirchi/uzlib](https://github.com/tahrirchi/uzlib)), "to'g'ri so'z" bo'limi, 1 501 ta savol. Prompt va javobni ajratish asl skript bilan bir xil. Buni leaderboard'ning saqlangan 150 741 ta javobida tekshirdim: hammasida bir xil natija chiqdi.

```bash
pnpm eval:uzlib run --provider=deepseek --model=deepseek-v4-pro --effort=high --limit=200   # avval kichik sinov
pnpm eval:uzlib run --provider=deepseek --model=deepseek-v4-pro --effort=high                # to'liq
pnpm eval:uzlib run --provider=gemini --model=gemini-3.8-flash --effort=high
pnpm eval:uzlib run --provider=openai --model=gpt-6-luna --effort=medium --limit=200          # leaderboard sozlamasi: sinov to'g'riligini tekshiradi
pnpm eval:uzlib run --provider=openai --model=gpt-6-luna --effort=high --limit=200            # bizning sozlama
pnpm eval:uzlib report --compare=<uzlib>/artifacts/deepseek-v4-pro.jsonl
```

Hisobotda quyidagilar chiqadi:

- to'g'ri javoblar ulushi va 95% ishonch oralig'i;
- javobsiz qolgan savollar soni;
- javob qaytargan modelning haqiqiy versiyasi;
- tokenlar va taxminiy narx;
- juft solishtirish (McNemar testi): `--compare` ga leaderboard javoblari yoki o'zimizning `eval-data/uzlib/runs/*.jsonl` beriladi.

To'xtab qolsa, buyruqni qayta ishga tushiring: bajarilgan savollar o'tkazib yuboriladi.

Xarajat chegarasi: `--max-cost` (odatda $1). Shu ishga tushirishdagi sarf chegaraga yetsa yoki kalit/balans xatosi kelsa, skript to'xtaydi. Narxi skriptda yo'q modelda (Gemini) chegara ishlamaydi, skript buni ogohlantiradi.

## 2. Sinov to'plami: ustoz tayyorlaydi

Har bir esse alohida papkada turadi: `eval-data/gold/<esse>/`.

| Fayl                | Mazmuni                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `topic.txt`         | Topshiriq (vaziyat) matni                                                  |
| `1.jpg`, `2.jpg`, … | Varoq rasmlari, tartib bilan. Faqat o'quvchi roziligi bilan                |
| `transcript.txt`    | O'quvchi yozganini **aynan** ko'chirilgan matn, xatolari belgilangan holda |
| `ai_text.txt`       | Ixtiyoriy: qo'lyozmani AI o'qigan matn (ustoz shundan boshlab tuzatgan)    |

Qo'lyozmada ustoz matnni noldan yozmaydi: AI o'qigan matn tayyor turadi, ustoz varoqqa qarab faqat noto'g'ri o'qilgan joylarni tuzatadi. Xavfi bor: AI o'quvchining xatosini o'zi tuzatib yuborgan bo'lsa, ustoz buni sezmay qolishi mumkin. Shuning uchun ko'chirish oynasida ustozga aynan shu joylarni tekshirish eslatiladi.

### Xatolarni belgilash

Har bir xato `{yozilgani|to'g'risi|T}` ko'rinishida yoziladi. `T` — xato turi:

- `I` — imlo;
- `P` — punktuatsiya;
- `Q` — qo'shimcha;
- `S` — so'z qo'llash.

```
{Albatta|Albatta,|P} bugungi kunda {dust|do'st|I} topish oson emas. {Kitoblarlar|Kitoblar|Q} ...
```

- Xatoboshilar saqlanadi.
- O'quvchi o'zi o'chirgan so'z yozilmaydi.
- O'qib bo'lmaydigan so'z o'rniga `[?]` qo'yiladi.

### Ballar

Barcha esselar uchun bitta umumiy fayl: `eval-data/gold/scores.csv`. Uni Excel'da to'ldirsa ham bo'ladi.

```
essay,rater,style,views,evidence,parts,structure,coherence,spelling,punctuation,affixes,wordUsage,lexicon,purity,special
e001,U1,1.5,1,1,1.5,2,1.5,1,0.5,2,1.5,1,2,
e001,U2,1.5,1.5,1,1,2,1.5,1,1,2,1.5,1,2,
```

- Har bir esseni **ikki ustoz bir-birining bahosini ko'rmasdan** baholaydi.
- Ballar 0, 0.5, 1, 1.5 yoki 2 bo'ladi.
- `special` ustuniga esse tekshirilmaydigan holatdagina kalit yoziladi: `OFF_TOPIC`, `TOO_SHORT`, `COPIED`, `ONLY_INTRO`, `CYRILLIC` yoki `BLANK`. Oddiy esseda bo'sh qoldiriladi.

### Hajm

Kamida 50 ta esse kerak. Ular har xil darajadagi o'quvchilardan, har xil mavzularda va har xil rasm sifatida bo'lsin. 30 tadan kam esse bo'lsa, hisobot ogohlantiradi va undan xulosa chiqarilmaydi.

## 3. Qo'lyozma o'qishni o'lchash (Luna, DeepSeek Flash)

To'plam admin'dagi Esselar > Sinov to'plami > eksportdan olinib, `eval-data/gold/` ga ochiladi. Ballar shart emas, rasm va ko'chirilgan matn yetadi.

```bash
pnpm eval:ocr run --provider=openai --model=gpt-6-luna --effort=medium
pnpm eval:ocr run --provider=deepseek --model=deepseek-flash --effort=high
pnpm eval:ocr report
```

Hisobotda: CER va WER, o'quvchi xatolaridan nechtasi o'qishda saqlangani yoki tuzatib yuborilgani, bitta esse narxi va ikki model o'qishi orasidagi farq. 30 tadan kam esse bo'lsa, xulosa chiqarilmaydi.

## 4. O'lchash

```bash
pnpm eval:gold run --label=v1 --text=ocr    # haqiqiy oqim: rasm → Gemini o'qiydi → DeepSeek baholaydi
pnpm eval:gold run --label=v1 --text=gold   # ustoz ko'chirgan matnni baholash: o'qish xatosi ta'sirini ajratadi
pnpm eval:gold report --label=v1 --text=ocr
```

Hisobot uch qismdan iborat:

| Qism        | Nimani ko'rsatadi                                                                                                                      | Me'yor                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| O'qish      | CER va WER (harf va so'z darajasidagi xato), qaysi model o'qigani. Eng muhimi — o'qishda **tuzatib yuborilgan** o'quvchi xatolari soni | —                                                                                    |
| Xato topish | Har bir tur bo'yicha aniqlik, to'liqlik va F0.5. F0.5 aniqlikka ikki baravar og'irlik beradi, chunki soxta xato o'quvchidan ball oladi | —                                                                                    |
| Ballar      | Har bir band bo'yicha QWK: AI–ustoz va ustoz–ustoz; aynan va ±0,5 mos kelish; umumiy ball bo'yicha MAE va SMD                          | ETS: QWK ≥ 0,70; \|SMD\| ≤ 0,15; AI–ustoz mosligi ustoz–ustoz mosligidan ≤ 0,10 past |

Metrikalar testi: `pnpm test:eval`. QWK mustaqil Python hisobi bilan 10 xonagacha mos keladi.
