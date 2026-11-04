/**
 * "Ona tili va adabiyot fanidan namunaviy test topshiriqlari" (Milliy sertifikat namunasi) importi.
 *
 * DIQQAT: manba PDF'da javoblar kaliti YO'Q. Bu yerdagi kalitlar taklif (keyStatus):
 *   - "proposed"  — ishonch yuqori, lekin baribir ustoz tasdiqlashi kerak;
 *   - "uncertain" — bahsli, ustoz albatta tekshirsin.
 * Test QORALAMA (nashr qilinmagan) holatda yaratiladi. Ustoz savolni admin panelda saqlasa, belgi o'chadi.
 *
 * Ishga tushirish:  pnpm --filter @onatili/db exec tsx prisma/import-milliy-namuna.ts
 * Qayta ishga tushirish xavfsiz: test hali topshirilmagan bo'lsa, yangidan yaratiladi.
 */
import { PrismaClient, type QuestionType } from "@prisma/client";

const prisma = new PrismaClient();
const TEST_ID = "mock-milliy-namuna-1";
const P = "mn"; // savol id prefiksi

type Key = "proposed" | "uncertain";
interface Q {
  n: string; // topshiriq raqami ("40a")
  points: number;
  text: string;
  type?: QuestionType;
  options?: string[];
  correct?: number; // 0 = A
  answer?: string; // TEXT: "variant1|variant2"
  key?: Key;
  passage?: string;
  explanation?: string;
}

const passages: Record<string, { title: string; body: string }> = {
  merkuriy: {
    title: "Matn: Merkuriy (18–22)",
    body: `Matnni o'qing va quyidagi topshiriqlarni bajaring.

Quyosh tizimidagi eng kichik sayyora − Merkuriy. Sayyora Rim xudosi Merkuriy nomi bilan atalgan. Merkuriyni kuzatgan birinchi astronom Galiley Galelio edi. **[1]** *Merkuriyning o'ziga xos jihatlaridan biri boshqa barcha sayyoralardan kichik ekanligidir.* Merkuriy atmosferasining asosiy kimyoviy elementi geliy bo'lganligi bois u yulduz singari yorqin. Oddiy teleskop yordamida ham ushbu ajoyib sayyorani ko'rish mumkin. Ertalab Quyosh chiqqanida yoki kechqurun Quyosh botishida esa teleskopsiz ham kuzatish mumkin. Merkuriy Quyoshga boshqa sayyoralardan ko'ra yaqin. U Yerga nisbatan yetti barobar ko'p Quyosh energiyasini oladi. **[2]** *Merkuriy yuzasi Oy yuzasiga o'xshaydi: ko'p sonli kraterlar mavjud, ularning ba'zilari ancha chuqur.* Astronomlar Merkuriyning yadrosida temir mavjud degan taxminni ilgari surgan edilar. Keyinchalik esa Merkuriy yadrosida temirning ulushi boshqa sayyoralarga qaraganda yuqori ekanligi aniqlandi.

Merkuriy o'zining magnit maydoniga ega, ammo Yerdan bir necha marta kuchsizroq. Bu shuni ko'rsatadiki, yadro suyuq bo'lishi mumkin. Merkuriyda tabiiy yo'ldoshlar yo'q. Orbitada sayyora notekis harakat qiladi. Merkuriyda bo'lish va Quyoshga qarash imkoni bo'lganida edi, uning teskari yo'nalishda harakat qilishini ko'rish mumkin bo'lar edi. **[3]** *Bu tabiiy jarayon afsonalarda Joshuaning Quyoshni to'xtatgani voqeasi bilan izohlanadi.*

Sayyora evolyutsiyasiga Quyosh katta ta'sir ko'rsatdi. Taxminan bir asr oldin Merkuriy sirtining yarmi muntazam issiq bo'ladi degan faraz paydo bo'lgan edi, chunki sayyoraning bir tomoni doimo Quyoshga qarab turadi. Ammo bu da'vo noto'g'ri edi. Merkuriy kuchsiz tortishish kuchiga ega. Atmosferaning siyrakligi sayyorani meteoritlar, shamollar va boshqa tabiat hodisalariga qarshi himoyasiz qiladi. Merkuriyning kometaga o'xshash dumi bor. Uning uzunligi 2,5 million km. Merkuriy tekis mintaqasi tufayli yosh deb qaraladi. Yuqori haroratga qaramay, sayyorada suv muzlarining ulkan zaxiralari mavjud. U chuqur kraterlar va qutbli nuqtalarning pastki qismida joylashgan. Muzlar hech qachon erimaydi, chunki baland devorlar ularni Quyosh nurlaridan to'sib turadi. Ilgari Merkuriy Veneraning yo'ldoshi degan gipoteza mavjud edi. **[4]** *Merkuriy yil davomida Quyosh atrofida 4 marta va o'z o'qi atrofida 6 marta aylanadi.* Radiusi kichik ekanligiga qaramay Merkuriyning massasi ulkan sayyoralardan, masalan Titan va Ganimedan ham ortiqdir. Bu katta yadroga ega ekanligi bilan bog'liq.`,
  },
  tanho: {
    title: "Matn: «Tanho qayiq» (23–27)",
    body: `Matnni o'qing va quyidagi topshiriqlarni bajaring.

# TANHO QAYIQ
*(Orol bobodan dramatik rivoyat)*

*Kechki payt. Hovli kimsasiz. Ota-o'g'il − qo'lida «diplomat» portfel, bashang kiyingan Qalimbet, uning ortidan kundalik engil-boshda Orol bobo kirib keladi.*

**Orol bobo** *(qo'l siltab)*. Qo'y, Qalimbet, qarigan chog'imda sarson qilib yurma odamni. O'z uyim − o'lan to'shagim debdilar...

**Qalimbet** *(o'zini eshitmaganga solib)*. Hamma jihozi muhayyo! Mehmonxona-yu oshxonalarini ko'rdingiz... Bir boshga yana nima kerak, to'g'rimi? *(«Diplomat»ini dastgoh ustiga tashlab.)* Kichikroq bo'lsayam obodgina hovli. Yozlarda karavotni qo'yib olib...

**Orol bobo**. Kimniki o'zi u?

**Qalimbet**. Sizniki-da, ota, sizniki! Sizga deb olindi.

**Orol bobo** *(hang-mang)*. Meniki?! Sotib oldingmi? Kimdan, qanchaga?

**Qalimbet**. Uzumini yeng-u, bog'ini so'ramang. Hukumat bobo qurgan uni! Puli to'lansa bas, qurib beraveradi. Qarigan chog'ingizda bir suyuntiraylik dedik-da sizni. O'tiring bunday, o'tiring... *(U mehribonlik bilan kiftidan tutib otasini hovli o'rtasidagi buklama o'rindiqqa o'tqizadi, o'zi shunga yondosh qo'lbola kursidan joy oladi.)* Yurasizmi endi bu cho'l-u biyobonda! El-ulus bizni ayb qilyapti-ku, shundoq o'g'il-qizlari shaharlarda davron surib yuribdi-yu, otalari huv bir ovloqda qarovsiz qolib ketgan, deb...

**Orol bobo** *(hasratomuz)*. Cho'l-u yobon deysan... Onang mana shu yerda yotibdi, bobo-momolaring shu yerda... Ularni tashlab men qayoqqa ketardim, o'g'lim, o'ylab gapiryapsanmi? Onangning mozorini ziyorat qilmagan kunim dunyo ko'zimga qorong'i... Bu yoqda qayiqlarim, Orol...

**Qalimbet**. Eski ashula! Orol, Orol! O'zingiz bilasiz-ku, ota, u endi hech qachon o'zaniga qaytmaydi, to'lmaydi. Qayiqlaringiz ham birovga keraksiz...

**Orol bobo** *(shasht bilan bosh ko'tarib, jo'shib)*. Nima?! Qaytmaydi, to'lmaydi... Siz qayoqdan bilibsiz, xudomisiz?! Ha, to'lmaydi! To'ldirolmaysan uni! Hech biring! Olim-u ulamong ham, boshqang ham! Chunki baring foydani ko'zlaysan! Orol g'irrom emas, senlar g'irrom, ha! Xudo senlarga insof bergan kuni u o'z-o'zidan suvga to'ladi! Xudoyim to'ldiradi uni, bilib qo'y! *(Og'ir xo'rsinib.)* O'sha kunni ko'rib o'lsam armonim qolmasdi...

**Qalimbet**. Mayli, mayli, otajon, qattiqroq ketibman, tavba qildim. Lekin gapning bori ham shu-da, axir. Odam ertasini o'ylab ish tutgani yaxshi. Xudo ko'rsatmasin-u, ertaga bir kun... Biz sharmanda bo'lib qolmaylik deyman-da.

**Orol bobo**. Gap bu yoqda degin? Sharmanda bo'lmaysan, qo'rqma... *(Bir zum o'yga tolib.)* Mana, o'zing boshlading, o'g'lim. Mabodo bir kun ajalim yetib, suv kelganini ko'rmay ketar bo'lsam, aytib qo'yay, jasadimni qayiqqa solib, Orolga eltib tashlaysan! Mayli, baliqlarga yem bo'lay! Mayli...

**[1] Qalimbet (sapchib tushgudek). Iye-iye, ota, bu nima deganingiz?! Axir, musulmonchiligimiz qayoqda qoladi unda?**

**Orol bobo** *(boyagi shashtidan tushmay, birmuncha muloyim, ammo qat'iy yo'sinda)*. Bir musulmon bo'lsa menchalik bo'lar, Qalimbet! O'g'limmisan, mana shu aytganimni bajarasan, gap tamom! Vasiyat bu, xudoyim ham kechirar...

**Qalimbet** *(yasama bir ko'tarinkilik bilan)*. E, otaboy, qo'ying halitdan shu sovuq gaplarni! Siz hali ko'p yashaysiz, ko'p! Yangi uylarda davron qilib, a!.. Qalay, ma'qul keldimi o'zi sizga?

**Orol bobo** *(bo'shashibroq, sovuqqina)*. Yaxshi, yaxshi... Lekin... *(Qo'l siltab.)* Hay, o'zingdan gapir. Ishlar jilyaptimi axir?

**Qalimbet** *(jiddiy tortib)*. Ishlarim yomonmas, ota. Yomonmas-u, shu keyingi vaqtda unchalik yaxshiyam emas. Orqaga ketgandayroq. Bir xizrsifat odam maslahat berib qoldi deng. Borib otangizning ko'nglini obdon ovlab, duosini olib kelsangiz, bari yurishib ketadi, deydi...

**Orol bobo**. **[2] Shunday dedimi o'sha xizrsifating?** Bo'pti, mana, duosi bizdan: iloyim, ishlaring birdan yurishib ketsin! *(U yuziga fotiha tortib qo'yadi.)* Shunga keldim de?

**Qalimbet** *(norozilanib)*. Bunaqa duo emas-da, ota!

**Orol bobo**. Qanaqasidan bo'lsin, ayt?.. Qulog'ingga quyib olgin, bola: chinakam g'ayrat bilan, toza ko'ngil bilan qilingan ish hech qachon orqaga ketmaydi − duosi o'zi bilan bo'ladi uning! *Bir damlik sukut.*

**Qalimbet**. Ha, aytganday, eshitdingizmi − Gulxadichamiz deputat bo'lmoqchi!

**Orol bobo**. Deputat? Qanday deputat?

**Qalimbet**. Jo'qorg'i Kengesga!

**Orol bobo**. Uniyam duo qilib qo'yish kerakmi? Nima deb? Jo'qorg'i Kengesga o'tsin debmi, undan narigami?..

**Qalimbet**. O'zimizdan chiqqani yaxshi-da, ota. Foydasi tegib turadi: sizga ham, menga ham, o'ziga ham...

**Orol bobo**. Menga?! Nima, Orolni to'ldirib beradimi?

**Qalimbet**. To'ldirib berar... *(kulib)* gap bilan! Qizingiz mahmadona-ku, shuning uchun saylanyapti-da...`,
  },
  gazal: {
    title: "G'azal: Alisher Navoiy (28–32)",
    body: `G'azalni o'qing va quyidagi topshiriqlarni bajaring.

*1. Ko'ngillar nolasi zulfing kamandin¹ nogahon ko'rgach,*
*Erur andoqki, qushlar qichqirishqaylar yilon ko'rgach.*

*2. Ko'ngil chokin ko'zumda ashki² rangin elga fosh etdi,*
*Balig' zaxmini fahm aylarlar el daryoda qon ko'rgach.*

*3. Ko'zum qon yosh to'kar, netib ko'ngil zaxmin yashuraykim,*
*Toparlar yerda zaxmin sayd³ qonidin nishon ko'rgach.*

*4. Bo'yolg'on qon aro jon pardasi yetgach g'ami hajring,*
*Ko'ngil bog'ida bargedurki, ol o'lmish xazon ko'rgach.*

*5. Xadanging⁴ zaxmi ichindin balolarni yug'on yoshim*
*Erur tifle⁵ ki, olg'ay qush bolasin oshyon ko'rgach.*

*6. Ko'ngillar naqdini toroj etarga yopmog'ing burqa'⁶,*
*Aningdekdurki, toz bog'lar qaroqchi karvon ko'rgach.*

*7. Yuzin zulf ichra to ko'rdim, o'lib vasliga yetmasmen,*
*G'alat ermish yuz urmoq, kecha o'tni har qayon ko'rgach.*

*8. Erur chun olam ichra joh⁷ foniy, yaxshi ot boqiy,*
*Bas, el komin⁸ ravo ayla, o'zingni komron ko'rgach.*

*9. Navoiy, xurdai⁹ nazmingni andoq aylading tahrir,*
*Ki sochqay xurda boshing uzra shohi xurdadon ko'rgach.*

**LUG'AT:** kamand¹ − arqon; ashk² − ko'zyosh; sayd³ − ov, o'lja; xadang⁴ − o'q; tifl⁵ − yosh bola; burqa'⁶ − yuzga tutilgan parda; joh⁷ − boylik, davlat; kom⁸ − maqsad, orzu; xurda⁹ − nozik, yashirin, sir.`,
  },
  moslash: {
    title: "Moslashtirish (33–35)",
    body: `Gaplar (33, 34, 35) va sintaktik tahlilga oid izohlar (A−F) ni o'zaro to'g'ri moslashtiring.

**33.** *Vatan! Qadrdon maskan!*

**34.** *Inson uchun o'zi tug'ilib ulg'aygan tuproqdan-da qadrliroq joy bormikan?!*

**35.** *Donishmanddan so'radilar: "Bu yorug' olamda halovat topmoq uchun qay go'zal maskandan, qay ulug' diyordan makon tutay?" Javob ayladi: "Vatandan!"*

A) atov gap
B) shaxsi (egasi) umumlashgan gap
C) to'liqsiz gap
D) ikki bosh bo'lakli gap
E) shaxsi (egasi) noma'lum gap
F) kiritmali gap`,
  },
};

const MATCH = ["atov gap", "shaxsi (egasi) umumlashgan gap", "to'liqsiz gap", "ikki bosh bo'lakli gap", "shaxsi (egasi) noma'lum gap", "kiritmali gap"];

const questions: Q[] = [
  { n: "1", points: 1.1, text: "Imloviy jihatdan **to'g'ri yozilgan so'zlar qatorini aniqlang.**", options: ["taassuf, murojatnoma, tabiiy", "tanazzul, muassasa, ma'dad", "muvofiq, taasurot, taalluqli", "maishiy, tafovut, tafakkur"], correct: 3, key: "proposed", explanation: "To'g'ri yozilishi: murojaatnoma, madad, taassurot." },
  { n: "2", points: 1.1, text: "Imloviy jihatdan **to'g'ri yozilgan so'zlar qatorini aniqlang.**", options: ["o'zidan-o'zi, voy-voy, baxt-u saodat", "o'z-o'zidan, voy-voylamoq, hol-ahvol", "o'z-o'zicha, voy-voyiga, baxt-saodatli", "o'z-o'zligicha, voyvoyak, tarjimayi-hol"], correct: 0, key: "uncertain" },
  { n: "3", points: 1.1, text: "Qaysi gapda **ochiq** so'zi **o'z ma'nosida qo'llangan**?", options: ["Nafisa o'z fikrlarini ko'pchilik oldida ham ochiq ifoda qila olardi.", "Yig'ilishda aytilgan anchagina muammolar ochiq qoldi.", "Haftaning dushanba kuni ochiq eshiklar kuni deb e'lon qilindi.", "Ismat ota ochiq derazadan boshini chiqarib, o'g'lini chaqirdi."], correct: 3, key: "proposed" },
  { n: "4", points: 1.7, text: "O'zaro **ma'nodoshlik hosil qila oladigan so'zlarni aniqlang.**", options: ["noo'xshash – farq – tafovut", "basavlat – sumbat – gavda", "turfa – g'alati – ajoyib", "qasoskor – o'ch – intiqom"], correct: 2, key: "proposed", explanation: "Qolgan qatorlarda bitta so'z boshqa turkumga (sifat) tegishli." },
  { n: "5", points: 1.1, text: "Qaysi gapda qo'shimcha qo'llash bilan bog'liq **uslubiy xatolik mavjud EMAS**?", options: ["Iqtisodiy islohotlarning sersamaradorligini ta'minlash uchun ishlar olib borilmoqda.", "So'zlarimizning ma'noviy bo'yoqdorliligi nutqimiz jozibasini yanada oshiradi.", "Qadriyatlarimizga nopisandsizlik bilan munosabatda bo'lish milliy fojiamizdir.", "Olimlarimiz havola etayotgan ushbu loyiha yashash sifatini oshirishga qaratilgan."], correct: 3, key: "proposed" },
  { n: "6", points: 1.1, text: "Qaysi gapda **g'urur** so'zi \"**kibr**\" **ma'nosida qo'llangan**?", options: ["Gapingizni qarang, bunchalik g'ururga berilmang, g'urur g'urbatga solar.", "Do'ppi − o'zbek xalqining milliy iftixori va milliy g'ururi hisoblanadi.", "G'ofur aka yuragi g'ururga to'la chin inson va otashnafas shoir edi.", "Uning yigitlik g'ururi yordam so'rab borishga yo'l qo'ymadi."], correct: 0, key: "proposed" },
  { n: "7", points: 1.7, text: "Qaysi gapda nuqtalar o'rnida **so'z yasovchi, lug'aviy shakl yasovchi va sintaktik shakl yasovchi** qo'shimcha qo'llanadi?", options: ["Vatan ravnaq... yo'lida xizmat qil... barchamizning sharafli burchimiz... .", "Ta'lim tiz...ining barcha bo'g'in...i o'zaro hamjihatlik bilan ishla...i kerak.", "Boy...ing bo'lma... ham, do'stlaring ko'p bo'lsin, ular kulfatda madad... bo'lishadi.", "Sohada sifat ko'rsat...larining o'sib bora...i ijobiy o'zgarishlardan dalolat ber... ."], correct: 3, key: "uncertain" },
  { n: "8", points: 2.5, text: "Har uchala parchada ham ishtirok etgan **fe'l shakllarini aniqlang.**\n\n*I. Yomon holga tushganning shod et dilin,*\n*Unutma, yomon kun kelib qolmasin.*\n*II. Shirin so'zli shilgay g'anim po'stini,*\n*Dag'al so'zli dushman qilur do'stini.*\n*III. Shirin so'zni o'rgan mudom Sa'diydan,*\n*Dag'al so'zli odam o'tar g'am bilan.*\n\n1) buyruq maylidagi fe'l; 2) qo'shma fe'l; 3) ko'makchi fe'lli so'z qo'shilmasi; 4) sifatdosh; 5) III shaxs birlikdagi fe'l; 6) sof fe'l", options: ["1 va 5", "3 va 4", "2 va 6", "5 va 6"], correct: 3, key: "proposed" },
  { n: "9", points: 1.7, text: "Berilgan gapda ishtirok etgan ko'makchi **qanday mazmuniy munosabat ifodalagan**?\n\n*Buyuk bobolarimizning ma'naviy merosi xususida so'z yuritganimizda Alisher Navoiyning \"Xamsa\" asarini alohida tilga olamiz.*", options: ["vosita ma'nosini", "fikr mavzusi ma'nosini", "tarz, holat ma'nosini", "yo'nalish ma'nosini"], correct: 1, key: "proposed" },
  { n: "10", points: 1.7, text: "Berilgan gap haqidagi **to'g'ri fikrni aniqlang.**\n\n*Xalqimizning asrlar davomida shakllangan qadimiy madaniyati va qadriyatlarini asrab qolishimiz uchun yosh avlodni milliy ruhda tarbiya qilishimiz lozim.*", options: ["Ravish holi ot kesimga to'g'ridan to'g'ri tobelangan.", "Payt holi fe'l kesimga to'g'ridan to'g'ri tobelangan.", "Maqsad holi vositasiz to'ldiruvchiga tobelangan.", "To'ldiruvchi aniqlovchiga kelishik yordamida tobelangan."], correct: 0, key: "uncertain" },
  { n: "11", points: 1.7, text: "Gapdagi so'zlarning mazmun va grammatik jihatdan **bog'lanishi to'g'ri ko'rsatilgan javobni aniqlang.**\n\n*Bizning qadimiy va go'zal diyorimiz nafaqat Sharq, balki jahon sivilizatsiyasi beshiklaridan biri ekanligi, o'ylaymanki, bugun keng jamoatchilik uchun sir emas.*", options: ["qadimiy Sharq, go'zal diyor", "qadimiy va go'zal, bugun sir emas", "beshiklaridan ekanligi, nafaqat Sharq", "bizning Sharq, keng jamoatchilik"], correct: 1, key: "proposed" },
  { n: "12", points: 2.5, text: "Qaysi gaplarda tire o'zaro **bir xil punktuatsion qoida asosida qo'yilgan**?\n\n1. Negadir o'z noroziligini keskin ifodaladi: \"Soni bor − sifati yo'q\".\n2. Biroz o'ylanib javob berdi: \"Islohotlardan maqsad − sifatli ta'lim\".\n3. \"Avvalo, Vatan muqaddas sajdagohdir\", − derdi adabiyot ustozimiz.\n4. Insonning qattiqqo'l ustozi − hayot, aqlli tarbiyachisi esa kitobdir.\n5. Til, adabiyot va madaniyat − barchasi millatning borligidan dalolatdir.\n6. Rassom inson ruhiyatini − uning qalbini o'z ijodida aks ettiradi.", options: ["2 va 3", "1 va 2", "5 va 6", "2 va 4"], correct: 3, key: "proposed", explanation: "2 va 4: ega va kesim ot bilan ifodalanganda ular orasiga tire qo'yiladi." },
  { n: "13", points: 1.7, text: "She'riy parcha haqidagi **to'g'ri hukmni aniqlang.**\n\n*Mengiz yo ravzayi rizvonmudur bu?*\n*Og'iz yo g'unchayi xandonmudur bu?*", options: ["Mutlaq va muqayyad qofiya qo'llangan.", "r undoshi raviy vazifasini bajargan.", "Yoyiq va yig'iq radif qo'llangan.", "u unlisi raviy vazifasini bajargan."], correct: 2, key: "uncertain" },
  { n: "14", points: 1.7, text: "She'riy parcha haqidagi **to'g'ri hukmni aniqlang.**\n\n*Labingdin chun suchuklik qand o'g'urlar,*\n*Solurlar el ani suvg'a yalang'och.*", options: ["El suvga tashbeh qilingan.", "Suv tashxis asosida tasvirlangan.", "Husni ta'lil san'ati aks etgan.", "Tardi aks san'ati aks etgan."], correct: 2, key: "uncertain" },
  { n: "15", points: 1.7, text: "\"Sarviqomat dilbarim\" qissasi mazmuniga oid **quyidagi qaysi javob to'g'ri emas?**", options: ["Asarda eski qonun-qoidalarning zamonga moslab o'zgartirilmasligi tanqid qilingan.", "Asarda millat farzandlarining ta'limga e'tiborsizligi ochib berilgan.", "Asarda har qanday vaziyatda ham ota-onaning o'z farzandini kechiruvchanligi yuzaga chiqqan.", "Asarda har qanday vaziyatga to'g'ri baho bera oladigan va shu vaziyatda o'zini vazmin tuta oladigan inson tasviri mavjud."], correct: 2, key: "uncertain" },
  { n: "16", points: 1.7, text: "Mirkarim Osimning \"Jayhun ustida bulutlar\" asarida Abu Rayhon Beruniyning topqirligidan hayratda qolgan **hukmdor nomini aniqlang.**", options: ["Ma'mun ibn Ma'mun", "Abu Nasr ibn Iroq", "Ismoil Safaviy", "Mahmud G'aznaviy"], correct: 3, key: "uncertain" },
  { n: "17", points: 1.7, text: "Abdulla Qahhorning \"Asror bobo\" hikoyasiga oid **to'g'ri shakllantirilgan javobni belgilang.**", options: ["Asarga urush kayfiyatini olib kirgan Sodiqjonning urushda aytgan gapi butun jangchilar orasida maqol bo'lib ketadi.", "Og'abekovning o'limiga sabab, uning ko'ngilchanligi edi, qurolsiz, yarador bo'lgan nemis jangchisini o'ldirishni paysalga solganligi o'zini halok etadi.", "Asror bobo urushda, urushdagina emas, front ortida ham ko'ngilni fahm-farosat bilan yo'lga solish kerakligini, g'aflatda qolib ketmaslik kerakligini ta'kidlab o'tadi.", "Kampir Sodiqjondan begunoh uch kishini o'ldirganini eshitib qattiq xafa bo'ladi."], correct: 2, key: "uncertain" },

  { n: "18", points: 1.7, passage: "merkuriy", text: "Matn mazmuniga mos **to'g'ri shakllantirilgan gapni aniqlang.**", options: ["Merkuriy tashqi ko'rinishi jihatidan oyga ham, kometaga ham o'xshaydi.", "Merkuriy Quyosh atrofida Veneraga nisbatan uzoqroq masofada aylanadi.", "Merkuriyni tadqiq etishga urinish XX asrning 20-30-yillarida boshlangan.", "Ulkan sayyoralar kabi Merkuriyning massasi ham uning hajmi bilan mutanosib."], correct: 0, key: "proposed" },
  { n: "19", points: 1.7, passage: "merkuriy", text: "Raqamlab ko'rsatilgan qaysi gap matnning mazmuniy tuzilishida **uslubiy xatolikni yuzaga keltirgan**?", options: ["4", "2", "1", "3"], correct: 2, key: "uncertain", explanation: "[1]-gap matn boshidagi «eng kichik sayyora» fikrini takrorlaydi." },
  { n: "20", points: 1.7, passage: "merkuriy", text: "Matn mazmunida **aks etgan ma'lumotni aniqlang.**", options: ["Merkuriy hajm jihatdan Titan va Ganimed kabi ulkan sayyoralardan ham yirik.", "Merkuriy Quyosh atrofida Yerga nisbatan kamroq muddatda aylanib chiqadi.", "Merkuriy yuzasining teng yarmi ulkan suv muzlari zaxiralari bilan qoplangan.", "Merkuriyning yadrosida temirning ulushi boshqa barcha moddalardan ko'p."], correct: 1, key: "proposed" },
  { n: "21", points: 1.7, passage: "merkuriy", text: "Matn mazmuniga mos **to'g'ri ifodalangan ma'lumotni aniqlang.**", options: ["Merkuriy atmosferasi tarkibida boshqa kimyoviy elementlarga nisbatan geliy elementi ko'p.", "Merkuriy sayyorasining orbitasi Quyoshga Yer orbitasiga nisbatan yetti barobar yaqin.", "Sayyora yadrosining suyuq ekanligi tortishish kuchi nisbatan kam bo'lishiga sabab bo'lgan.", "Atmosfera ekologiyasining yomonligi sayyorani turli tabiat hodisalaridan himoyasiz qoldiradi."], correct: 0, key: "proposed" },
  { n: "22", points: 1.7, passage: "merkuriy", text: "Quyidagi qaysi **faraz o'z isbotini topgan**?", options: ["Merkuriy Veneraning yo'ldoshi ekanligi haqidagi", "Merkuriyning yadrosida temir mavjudligi haqidagi", "Merkuriy sirtining yarmi hamisha issiq bo'lishi haqidagi", "Merkuriyning yadrosi suyuq bo'lishi mumkinligi haqidagi"], correct: 1, key: "proposed" },

  { n: "23", points: 1.1, passage: "tanho", text: "Asar nomi orqali **qanday badiiy maqsad ifoda etilgan**?", options: ["Ekologik fojiaga yuz tutayotgan Orol dengizining nochorligiga e'tibor qaratilgan.", "Jamiyat, hatto yaqinlari ham yolg'izlatib qo'ygan insonlarga ishora qilingan.", "Qalimbet singari ayrim kimsalarga jamiyatda o'rin yo'qligiga ishora qilingan.", "Gulxadichaning o'z maslagi yo'lida yolg'iz kurashayotganiga e'tibor qaratilgan."], correct: 1, key: "uncertain" },
  { n: "24", points: 1.1, passage: "tanho", text: "Orol bobo obraziga **mos ta'rif berilgan javobni aniqlang.**", options: ["ota-bobolariga sadoqatli bo'lsa-da, mehrsiz ota", "e'tiqodida sobit, qadriyatlarga sadoqatli inson", "Vatan sog'inchi bilan yashagan inson", "jamiyatdagi o'zgarishlarga loqayd inson"], correct: 1, key: "proposed" },
  { n: "25", points: 1.1, passage: "tanho", text: "Qalimbet obraziga **mos ta'rif berilgan javobni aniqlang.**", options: ["shaxsiy manfaati uchun o'z otasi va singlisiga qarshi bo'lgan, ularga zulm yetkazgan kishi", "insoniy burchini ado etish va otasining roziligini olish uchun intilgan sadoqatli farzand", "qadriyatlarni mensimaydigan, shaxsiy manfaatlarini har narsadan ustun qo'yadigan kimsa", "singlisiga ko'maklashish uchun har qanday mushkul ishni ham uddalashga urinadigan aka"], correct: 2, key: "proposed" },
  { n: "26", points: 1.1, passage: "tanho", text: "**[1]** raqami bilan ajratib ko'rsatilgan qismda tasvirlangan qahramon holati **qaysi javobda to'g'ri izohlangan**?", options: ["Otasining shakkoklik bilan aytgan gaplari uni larzaga soladi.", "Otasi asl maqsadini fosh qilib qo'yganidan mulzam bo'lib qolgan edi.", "Odamlardan malomatga qolishini o'ylab cho'chib ketadi.", "Otasining o'ta nochor ahvoliga juda achinib ketgan edi."], correct: 0, key: "proposed" },
  { n: "27", points: 1.1, passage: "tanho", text: "**[2]** raqami bilan ajratib ko'rsatilgan gapda **qanday uslubiy ma'no ifoda etilgan**?", options: ["kinoya, kesatiq", "malomat, ta'na", "alam, qahr", "kibr, jahl"], correct: 0, key: "proposed" },

  { n: "28", points: 2.5, passage: "gazal", text: "G'azal matla'si haqidagi **NOTO'G'RI hukmni aniqlang.**", options: ["Oshiqning ko'ngli qo'rquvda qolgan qushlarga qiyoslangan.", "Yor zulfining halqalari tuzoq misolidir deya tashbeh qilingan.", "Oshiq nolasi tuzoqdan ozod bo'la olmayotgan qushlarga qiyoslangan.", "Yorning zulfi qushlarga qo'rquv solgan ilonga qiyoslangan."], correct: 2, key: "proposed" },
  { n: "29", points: 2.5, passage: "gazal", text: "2-bayt mazmunida **AKS ETMAGAN fikrni aniqlang.**", options: ["Oshiqning qonli ko'zyoshlari daryoning suviga tashbeh qilingan.", "Qalb jarohati tufayli oshiqning ko'zlaridan qonli yosh oqadi.", "Oshiqning ko'ngil jarohatini ko'z yoshlari elga ma'lum aylaydi.", "El daryo suviga qarab unda baliq bor yoki yo'qligini bilib oladi."], correct: 3, key: "proposed" },
  { n: "30", points: 2.5, passage: "gazal", text: "4-bayt mazmuni **to'g'ri izohlangan javobni belgilang.**", options: ["Ko'ngil bog'ida barglar hech qachon xazon ofatiga yuz tutmaydi, shu bois oshiq qon yutsa ham, hajr g'amiga yengilmaydi.", "Xazon faslida bog'dagi barglar qizg'ish rangga kirgani kabi yor hajrida qolgan oshiqning jon pardasi qon tusiga kirdi.", "Ko'ngil xazonga yuz tutgan bog'ning barglari kabi qizg'ish rangdadir, shu bois jon pardasi ham hamisha qon tusida bo'ladi.", "Agar jon pardasi qon rangiga bo'yalsa, oshiq qalbi hajr g'amiga botadi, zero barglar qizg'ish tusga kirsa, xazon fasli boshlanadi."], correct: 1, key: "proposed" },
  { n: "31", points: 2.5, passage: "gazal", text: "G'azalda quyidagi **qaysi o'xshatish mavjud EMAS**?", options: ["Yor karvonni talash uchun shaylanib yuziga niqob tortgan qaroqchiga qiyos qilingan.", "Yorning sochlari tunga, yuzi ana shu zulmatni nurafshon etuvchi olovga qiyoslangan.", "Oshiqning ko'z yoshlari qush bolalarini inidan olib sho'xlik qiladigan bolalarga qiyoslangan.", "Oshiqning jarohat yetgan qalbi o'lja ketidan borib, o'zi yaralangan ovchiga qiyoslangan."], correct: 3, key: "proposed" },
  { n: "32", points: 2.5, passage: "gazal", text: "Quyidagi qaysi fikr 8-baytda **AKS ETMAGAN**?", options: ["Baxt va davlatdan yuz o'gir, o'zingga bino qo'yma.", "Elning murod-maqsadiga erishishi uchun xizmat qil.", "O'zingdan yaxshi nom qoldirish uchun harakat qil.", "Bu olamda davlat o'tkinchidir, unga ruju' qo'yma."], correct: 0, key: "proposed" },

  { n: "33", points: 1.7, passage: "moslash", text: "**33-gap** uchun to'g'ri izohni tanlang.\n\n*Vatan! Qadrdon maskan!*", options: MATCH, correct: 0, key: "proposed" },
  { n: "34", points: 1.7, passage: "moslash", text: "**34-gap** uchun to'g'ri izohni tanlang.\n\n*Inson uchun o'zi tug'ilib ulg'aygan tuproqdan-da qadrliroq joy bormikan?!*", options: MATCH, correct: 3, key: "proposed" },
  { n: "35", points: 1.7, passage: "moslash", text: "**35-gap** uchun to'g'ri izohni tanlang.\n\n*Donishmanddan so'radilar: \"Bu yorug' olamda halovat topmoq uchun qay go'zal maskandan, qay ulug' diyordan makon tutay?\" Javob ayladi: \"Vatandan!\"*", options: MATCH, correct: 4, key: "uncertain" },

  { n: "36", points: 1.7, type: "TEXT", text: "Ajratib ko'rsatilgan har uchala so'z bilan **ma'nodoshlik hosil qila oluvchi so'zni yozing.**\n\n1) **tez** orada\n2) **qadrdon** o'rtoqlar\n3) ko'ngilga **tanish**", answer: "yaqin", key: "proposed" },
  { n: "37", points: 2.5, type: "TEXT", text: "Berilgan gapda qo'llanilishi lozim bo'lgan **tinish belgilarining to'g'ri ketma-ketligini yozing.**\n\n*Sa'diy Sheroziy o'zining Bo'ston asarida shunday yozadi Shuni unutmaki badaxloq do'st yovuz dushmandan xavfliroq*\n\nDiqqat! Javobni faqat tinish belgilari bilan yozing.", answer: '"":",".', key: "uncertain", explanation: "Sa'diy Sheroziy o'zining \"Bo'ston\" asarida shunday yozadi: \"Shuni unutmaki, badaxloq do'st yovuz dushmandan xavfliroq\"." },
  { n: "38", points: 1.7, type: "TEXT", text: "Gapda **qaysi qo'shimchaning qo'llanishi bilan bog'liq uslubiy xatolik kuzatilgan**?\n\n*Ma'naviyat − insonni ruhan poklanishga chorlaydigan, odamning ichki dunyosini boyitadigan, irodasini baquvvat, iymon-e'tiqodini butun qiladigan, vijdonini uyg'otadigan, qalban ulg'ayadigan beqiyos kuchdir.*", answer: "ulg'ayadigan|ulg'aytiradigan|-tir|tir", key: "proposed", explanation: "«qalban ulg'ayadigan» emas, «qalban ulg'aytiradigan» bo'lishi kerak (-tir nisbat qo'shimchasi)." },
  { n: "39", points: 1.7, type: "TEXT", text: "Gapni sintaktik tahlil qiling va **qaysi gap bo'lagi uyushganini yozing.**\n\n*Ota-bobolarimiz necha asrlar mobaynida shu bepoyon mintaqada qanday hamjihat bo'lib, qanday qadriyatlar asosida yashab kelgan bo'lsa, bugun ham, ta'bir joiz bo'lsa, hayotning o'zi bizni − butun O'rta Osiyo xalqlarini − aynan ana shunday hamkorlik ruhida hayot kechirishga da'vat etmoqda.*", answer: "hol|ravish holi|uyushgan hol", key: "uncertain" },
  { n: "40a", points: 1.2, type: "TEXT", text: "Gapdagi so'zlarning mazmun va grammatik jihatdan bog'lanishini tahlil qiling.\n\n*Chinakam ma'naviyatli va ma'rifatli inson deyilganda biz inson qadrini biladigan, milliy o'zligini **anglay oladigan**, erkin va ozod jamiyatni qurish uchun, mustaqil davlatimizning jahon hamjamiyatida o'ziga munosib o'rin egallashi uchun fidoiylik bilan kurasha oladigan insonni tushunamiz.*\n\n**a)** gapda ajratib ko'rsatilgan so'z **tobelanib bog'langan** so'zni yozing.", answer: "insonni", key: "proposed" },
  { n: "40b", points: 1.3, type: "TEXT", text: "40-topshiriqdagi gap bo'yicha.\n\n**b)** gapda ajratib ko'rsatilgan so'z (**anglay oladigan**) bilan **teng munosabatda bog'langan** so'zni yozing.", answer: "biladigan|kurasha oladigan", key: "proposed" },
  { n: "41a", points: 0.8, type: "TEXT", text: "Berilgan gaplarni grammatik jihatdan to'g'ri bog'lang.\n\n1. *Yaxshi ustoz ham hikmatli kitob singaridir.*\n2. *Har ikkisi inson ruhini tarbiyalaydi.*\n\n**a)** birinchi va ikkinchi gapni **qanday grammatik vosita** yordamida to'g'ri bog'lash mumkin?", answer: "chunki|chunki bog'lovchisi", key: "proposed" },
  { n: "41b", points: 0.9, type: "TEXT", text: "41-topshiriqdagi gaplar bo'yicha.\n\n**b)** natijada **qo'shma gapning qaysi turi** hosil bo'ladi?", answer: "ergash gapli qo'shma gap|sabab ergash gapli qo'shma gap|ergashgan qo'shma gap", key: "proposed" },
  { n: "42a", points: 0.8, type: "TEXT", text: "She'riy parchadagi ajratib ko'rsatilgan so'z yordamida ifodalangan **she'riy san'atlarni aniqlang.**\n\n*Solib borma meni, ey Yusufi husn,*\n*Bukun **Ya'qubtek** bayt ul-xazanda.*\n\n**a)** birinchi she'riy san'at", answer: "talmeh|tashbeh", key: "uncertain" },
  { n: "42b", points: 0.9, type: "TEXT", text: "42-topshiriqdagi parcha bo'yicha.\n\n**b)** ikkinchi she'riy san'at", answer: "tashbeh|talmeh", key: "uncertain" },
  { n: "43a", points: 0.8, type: "TEXT", text: "She'riy parchaning qofiyasini tahlil qiling.\n\n*Kimki falak sori otar **toshini**,*\n*Tosh ila ozurda etar **boshini**.*\n\n**a)** ajratib ko'rsatilgan qofiyadosh so'zlardagi **raviyni** yozing.", answer: "sh|sh undoshi", key: "proposed" },
  { n: "43b", points: 0.9, type: "TEXT", text: "43-topshiriqdagi parcha bo'yicha.\n\n**b)** ajratib ko'rsatilgan so'zlar raviyning o'rniga ko'ra **qofiyaning qaysi turini** hosil qilgan?", answer: "mutlaq|mutlaq qofiya", key: "proposed" },
  { n: "44a", points: 0.8, type: "TEXT", text: "Quyidagi qit'a mazmunini tahlil qiling.\n\n*Debon bergan kishi erdur, va lekin*\n*Demay berganga erlik bil musallam.*\n*Ne deb, ne bersa bilgil ani xotun,*\n*Debon bermasni xotundin dag'i kam.*\n\n**a)** qit'ada **qanday illat** qoralangan?", answer: "va'daga vafo qilmaslik|va'dasiga vafo qilmaslik|va'da berib bajarmaslik|va'dabozlik|so'zida turmaslik|debon bermaslik", key: "uncertain" },
  { n: "44b", points: 0.9, type: "TEXT", text: "44-topshiriqdagi qit'a bo'yicha.\n\n**b)** qit'ada **qanday fazilat** ulug'langan?", answer: "saxiylik|saxovat|beminnat yordam|va'da qilmay berish|demay berish", key: "uncertain" },

  {
    n: "45",
    points: 24,
    type: "ESSAY",
    text: `# ESSE
Quyidagi vaziyat yuzasidan o'z munosabatingizni yozma bayon qiling.

**Bugungi kunda televideniye orqali namoyish qilinadigan turli mahsulotlar reklamalariga ko'pchilik salbiy munosabat bildiradi. Ayrimlar esa bunday reklamalarni kerakli deb hisoblashadi.**

- Fikr-mulohazalaringizni publitsistik uslubda bayon qiling.
- Fikrlaringizni mantiqiy izchillikda, adabiy til me'yorlariga amal qilgan holda ifodalang.

**Esse uch tarkibiy qismdan iborat bo'lishi lozim:**

**I. Kirish.** Ikki-uch jumladan iborat bo'lsin; berilgan vaziyat matnini aynan ko'chirmang.

**II. Asosiy qism.** Kamida uchta xatboshi; har birida tomonlarning qarashlari va shaxsiy qarashingizni yoriting; turli qarashlarni hayotiy misollar bilan dalillang; faqat mavzu doirasida yozing.

**III. Xulosa.** Asosiy qismdagi fikrlarni umumlashtiring; ikki-uch jumla.

*DIQQAT! Esse uchun reja tuzilmaydi, epigraf qo'yilmaydi.*`,
    explanation: "Baholash: tuzilish (kirish, asosiy qism, xulosa), mavzuga moslik, dalillar, mantiqiy izchillik, adabiy til me'yorlari va imlo.",
  },
];

async function main() {
  const existing = await prisma.test.findUnique({ where: { id: TEST_ID }, include: { _count: { select: { attempts: true } } } });
  if (existing && existing._count.attempts > 0) {
    console.log("Test allaqachon topshirilgan: qayta import qilinmadi (natijalar saqlanib qoladi).");
    return;
  }
  if (existing) await prisma.test.delete({ where: { id: TEST_ID } });
  await prisma.question.deleteMany({ where: { id: { startsWith: `${P}-` } } });
  await prisma.passage.deleteMany({ where: { id: { startsWith: `${P}-` } } });

  const sum = Math.round(questions.reduce((s, q) => s + q.points, 0) * 10) / 10;
  if (sum !== 100) throw new Error(`Ballar yig'indisi 100 emas: ${sum}`);

  for (const [key, p] of Object.entries(passages)) {
    await prisma.passage.create({ data: { id: `${P}-p-${key}`, title: p.title, body: p.body } });
  }

  for (const q of questions) {
    const type = q.type ?? "SINGLE";
    if (type === "SINGLE" && (q.correct === undefined || !q.options?.[q.correct])) throw new Error(`${q.n}: kalit yo'q`);
    await prisma.question.create({
      data: {
        id: `${P}-${q.n}`,
        type,
        text: q.text,
        passageId: q.passage ? `${P}-p-${q.passage}` : null,
        correctText: type === "TEXT" ? q.answer : null,
        explanation: q.explanation ?? null,
        difficulty: q.points >= 2.5 ? 4 : q.points >= 1.7 ? 3 : 2,
        aiReview: type === "ESSAY" ? undefined : { keyStatus: q.key ?? "proposed", source: "milliy-namuna-pdf" },
        options:
          type === "SINGLE"
            ? { create: q.options!.map((text, i) => ({ text, isCorrect: i === q.correct, order: i + 1 })) }
            : undefined,
      },
    });
  }

  await prisma.test.create({
    data: {
      id: TEST_ID,
      type: "MOCK",
      title: "Milliy sertifikat: namunaviy test",
      description:
        "Ona tili va adabiyot fanidan namunaviy test topshiriqlari: 45 ta topshiriq, 100 ball, 3 soat. Javob kalitlari ustoz tomonidan tasdiqlanishi kerak.",
      timeLimitSec: 3 * 3600,
      shuffle: false, // matnlarga tayangan savollar ketma-ketligi buzilmasin
      gradingScale: "MILLIY_SERTIFIKAT",
      isFree: false,
      isPublished: false, // QORALAMA: kalitlar tasdiqlanmaguncha
      questions: { create: questions.map((q, i) => ({ questionId: `${P}-${q.n}`, points: q.points, order: i + 1 })) },
    },
  });

  const uncertain = questions.filter((q) => q.key === "uncertain").map((q) => q.n);
  console.log(`Import tayyor: ${questions.length} ta savol, ${Object.keys(passages).length} ta matn, jami ${sum} ball.`);
  console.log(`Shubhali kalitlar (${uncertain.length}): ${uncertain.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
