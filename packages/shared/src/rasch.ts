/**
 * Rasch (1PL) modeli: P(to'g'ri) = 1 / (1 + e^-(θ − b)).
 * θ — talabgor qobiliyati, b — savol qiyinligi (ikkalasi logit shkalada).
 *
 * Baholash mezonlari hujjati bo'yicha: Z = (θ − μ) / σ, T = 50 + 10Z,
 * test natijalari uchun maksimal ball shartli ravishda 75.
 */

const P = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));
const clampStep = (x: number) => Math.max(-1, Math.min(1, x));
/** Hammasini to'g'ri/noto'g'ri yechganlar uchun cheksiz θ o'rniga: xom ballni 0,3 ga siljitish (amalda keng tarqalgan usul) */
const EXTREME_ADJ = 0.3;

/** Kalibrlash uchun kamida shuncha talabgor kerak; undan kam bo'lsa natija "dastlabki" */
export const RASCH_MIN_SAMPLE = 30;

/** Ma'lum savol qiyinliklari bo'yicha bitta talabgorning qobiliyati (MLE, Nyuton usuli) */
export function estimateTheta(responses: (0 | 1)[], b: number[]): number {
  const L = responses.length;
  if (!L) return 0;
  let r = responses.reduce<number>((s, x) => s + x, 0);
  if (r === 0) r = EXTREME_ADJ;
  if (r === L) r = L - EXTREME_ADJ;
  let theta = Math.log(r / (L - r));
  for (let it = 0; it < 100; it++) {
    let expected = 0;
    let info = 0;
    for (let i = 0; i < L; i++) {
      const p = P(theta, b[i]);
      expected += p;
      info += p * (1 - p);
    }
    const step = clampStep((r - expected) / Math.max(info, 1e-6));
    theta += step;
    if (Math.abs(step) < 1e-4) break;
  }
  return theta;
}

export interface Calibration {
  /** Savol qiyinliklari (o'rtachasi 0) */
  b: number[];
  /** Har bir talabgorning θ si */
  theta: number[];
  mu: number;
  sigma: number;
}

/**
 * JMLE (Joint Maximum Likelihood) bilan savol qiyinliklari va qobiliyatlarni birga baholaydi.
 * Hamma yechgan/hech kim yechmagan savollar va 0/maksimal ball olganlar baholashda qatnashmaydi
 * (ular uchun MLE cheksiz), keyin ularga chegaraviy qiymat beriladi. Wright tuzatishi (L−1)/L qo'llanadi.
 */
export function calibrate(matrix: (0 | 1)[][]): Calibration {
  const N = matrix.length;
  const L = N ? matrix[0].length : 0;
  const b = new Array<number>(L).fill(0);
  if (!N || !L) return { b, theta: [], mu: 0, sigma: 1 };

  const itemScore = Array.from({ length: L }, (_, i) => matrix.reduce((s, row) => s + row[i], 0));
  const personScore = matrix.map((row) => row.reduce<number>((s, x) => s + x, 0));
  const items = [...Array(L).keys()].filter((i) => itemScore[i] > 0 && itemScore[i] < N);
  const persons = [...Array(N).keys()].filter((n) => personScore[n] > 0 && personScore[n] < L);

  const theta = personScore.map((r) => Math.log(Math.max(r, EXTREME_ADJ) / Math.max(L - r, EXTREME_ADJ)));
  for (const i of items) b[i] = Math.log((N - itemScore[i]) / itemScore[i]);

  if (items.length >= 2 && persons.length >= 2) {
    for (let it = 0; it < 300; it++) {
      let maxChange = 0;
      for (const n of persons) {
        let e = 0, v = 0;
        for (const i of items) {
          const p = P(theta[n], b[i]);
          e += p;
          v += p * (1 - p);
        }
        // Faqat kalibrlanadigan savollar bo'yicha xom ball
        const r = items.reduce((s, i) => s + matrix[n][i], 0);
        const rr = r === 0 ? EXTREME_ADJ : r === items.length ? items.length - EXTREME_ADJ : r;
        const step = clampStep((rr - e) / Math.max(v, 1e-6));
        theta[n] += step;
        maxChange = Math.max(maxChange, Math.abs(step));
      }
      for (const i of items) {
        let e = 0, v = 0;
        for (const n of persons) {
          const p = P(theta[n], b[i]);
          e += p;
          v += p * (1 - p);
        }
        // Kutilgandan ko'p yechilgan savol osonroq (b kamayadi), kam yechilgan qiyinroq
        const observed = persons.reduce((s, n) => s + matrix[n][i], 0);
        const step = clampStep((observed - e) / Math.max(v, 1e-6));
        b[i] -= step;
        maxChange = Math.max(maxChange, Math.abs(step));
      }
      // Shkala nuqtasi: savollar qiyinligi o'rtachasi 0
      const mean = items.reduce((s, i) => s + b[i], 0) / items.length;
      for (const i of items) b[i] -= mean;
      if (maxChange < 1e-3) break;
    }
    const k = (items.length - 1) / items.length; // Wright tuzatishi
    for (const i of items) b[i] *= k;
  }

  // Hamma yechgan savol eng oson, hech kim yechmagan eng qiyin hisoblanadi
  const known = items.map((i) => b[i]);
  const lo = known.length ? Math.min(...known) : 0;
  const hi = known.length ? Math.max(...known) : 0;
  for (let i = 0; i < L; i++) {
    if (itemScore[i] === N) b[i] = lo - 1;
    if (itemScore[i] === 0) b[i] = hi + 1;
  }

  // Yakuniy θ: barcha savollar bo'yicha, har bir talabgor uchun alohida MLE
  const finalTheta = matrix.map((row) => estimateTheta(row, b));
  const mu = finalTheta.reduce((s, x) => s + x, 0) / N;
  const sigma = Math.sqrt(finalTheta.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(N - 1, 1)) || 1;
  return { b, theta: finalTheta, mu, sigma };
}

/** Hujjat bo'yicha standart ball: T = 50 + 10Z, Z = (θ − μ)/σ; test qismi 0..75 oralig'ida */
export function raschT(theta: number, mu: number, sigma: number): number {
  const t = 50 + (10 * (theta - mu)) / (sigma || 1);
  return Math.round(Math.max(0, Math.min(75, t)) * 10) / 10;
}
