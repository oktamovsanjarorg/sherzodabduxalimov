/**
 * UI audit (lokal): har sahifa × mavzu (light/dark) × o'lcham → skrinshot, konsol/HTTP xatolari,
 * axe (kontrast va a11y), gorizontal toshish. Natija: .ui-audit/<sana>/ (skrinshotlar + report.json).
 *
 * Talablar: `pnpm dev` ishlab turgan bo'lsin (API 4100, Mini App 5180, admin 5181), .env da BOT_TOKEN
 * va OWNER_USERNAMES ichida `audit_owner`. Chromium: `pnpm exec playwright-core install chromium`
 * yoki CHROMIUM_PATH=/yo'l/chrome.
 *
 * Ishlatish: pnpm ui:audit [miniapp|admin|all]
 * Sahifalar orasida ichki navigatsiya qilinadi: auth rate limit (30/daq) ga urilmaslik uchun.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, type Browser, type Page } from "playwright-core";
import { signInitData } from "@onatili/shared/server";

const API = process.env.AUDIT_API ?? "http://127.0.0.1:4100/api";
const MINI = process.env.AUDIT_MINIAPP ?? "http://127.0.0.1:5180";
const ADMIN = process.env.AUDIT_ADMIN ?? "http://127.0.0.1:5181/admin";

/** Bazadan olinadigan sahifalar (birinchi o'quvchi va uning tablari): main() to'ldiradi */
const EXTRA_ADMIN: string[] = [];
/** AUDIT_WIDTHS=320,360 — faqat shu kengliklar (telefon tekshiruvi); bo'lmasa odatdagi 390 / 1440+390 */
const WIDTHS = process.env.AUDIT_WIDTHS?.split(",").map(Number).filter(Boolean);

const MINI_ROUTES = ["/", "/lessons", "/profile", "/tests", "/mocks", "/essays", "/essays/new", "/subscribe", "/stats", "/parents", "/my-attendance", "/settings"];
const ADMIN_ROUTES = ["/", "/advisor", "/students", "/content", "/questions", "/tests", "/essays", "/attendance", "/parents", "/payments", "/payments?tab=SUBS", "/payments?tab=OFFLINE", "/billing", "/staff", "/stats", "/external", "/backups", "/trash", "/more"];

// Telegram'ning standart mavzulari (Android)
const THEMES = {
  light: { bg_color: "#ffffff", secondary_bg_color: "#efeff4", section_bg_color: "#ffffff", text_color: "#000000", hint_color: "#8e8e93", link_color: "#2481cc", destructive_text_color: "#e53935" },
  dark: { bg_color: "#212d3b", secondary_bg_color: "#151e27", section_bg_color: "#1d2733", text_color: "#ffffff", hint_color: "#7d8b99", link_color: "#62bcf9", destructive_text_color: "#ee686f" },
} as const;
type Scheme = keyof typeof THEMES;

interface Row {
  app: string;
  route: string;
  scheme: Scheme;
  width: number;
  overflow: number;
  axe: { id: string; impact: string | null; help: string; n: number; sample: string[] }[];
  errors: string[];
}

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

function initData(id: number, firstName: string, username: string) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error(".env da BOT_TOKEN yo'q");
  const user = JSON.stringify({ id, first_name: firstName, username });
  return signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user }, token);
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Telegram WebApp o'rniga: noma'lum metodlar no-op */
function tgMock(data: string, scheme: Scheme) {
  return `(() => {
    const noop = () => {};
    const btn = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop) });
    const base = { initData: ${JSON.stringify(data)}, initDataUnsafe: {}, colorScheme: ${JSON.stringify(scheme)},
      themeParams: ${JSON.stringify(THEMES[scheme])}, platform: "android", version: "8.0", isExpanded: true,
      BackButton: btn, MainButton: btn, SecondaryButton: btn, SettingsButton: btn, HapticFeedback: btn, CloudStorage: btn };
    Object.defineProperty(window, "Telegram", { value: { WebApp: new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop) }) } });
  })();`;
}

async function auditPage(page: Page, file: string) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.addScriptTag({ content: AXE });
  const axe = await page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (d: Document, o: object) => Promise<{ violations: { id: string; impact: string | null; help: string; nodes: { target: string[]; any: { message: string }[] }[] }[] }> } };
    const r = await w.axe.run(document, { resultTypes: ["violations"], runOnly: ["wcag2a", "wcag2aa", "best-practice"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((x) => `${x.target.join(" ")} :: ${x.any[0]?.message ?? ""}`) }));
  });
  return { overflow, axe };
}

async function run(browser: Browser, out: string, report: Row[], app: "miniapp" | "admin", width: number, scheme: Scheme, auth: { student: string; owner: { token: string; user: unknown } }) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
  await ctx.route(/telegram\.org/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  if (app === "miniapp") await ctx.addInitScript(tgMock(auth.student, scheme));
  else {
    const session = JSON.stringify({ ...auth.owner, expiresAt: Date.now() + 864e5 });
    await ctx.addInitScript(`sessionStorage.setItem("onatili-admin-session", ${JSON.stringify(session)});`);
  }
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message.slice(0, 200)}`));
  page.on("response", (r) => r.status() >= 400 && r.url().includes("/api/") && errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`));

  const base = app === "miniapp" ? MINI : ADMIN;
  const prefix = new URL(base).pathname.replace(/\/$/, "");
  const routes = app === "miniapp" ? MINI_ROUTES : [...ADMIN_ROUTES, ...EXTRA_ADMIN];
  for (const [i, route] of routes.entries()) {
    errors.length = 0;
    if (i === 0) await page.goto(base + route, { waitUntil: "domcontentloaded" });
    else {
      const path = prefix + (route === "/" && prefix ? "" : route) || "/";
      await page.evaluate((u) => {
        history.pushState({}, "", u);
        dispatchEvent(new PopStateEvent("popstate"));
        window.scrollTo(0, 0);
      }, path);
    }
    const name = `${app}-${width}-${scheme}-${route.replace(/[/?=]/g, "_") || "home"}`;
    const res = await auditPage(page, `${out}/${name}.png`);
    report.push({ app, route, scheme, width, ...res, errors: [...errors] });
    process.stdout.write(".");
  }
  await ctx.close();
}

async function main() {
  const which = process.argv[2] ?? "all";
  const out = `.ui-audit/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
  mkdirSync(out, { recursive: true });

  // Test foydalanuvchilar: o'quvchi (ismi kiritilgan) va ega (OWNER_USERNAMES da audit_owner)
  const student = initData(1000001, "Test", "test_student");
  const s = await post<{ token: string }>("/auth/telegram", { initData: student });
  await post("/me/name", { firstName: "Test", lastName: "O'quvchi" }, s.token).catch(() => {});
  const owner = await post<{ token: string; user: unknown }>("/auth/telegram", { initData: initData(1000002, "Ustoz", "audit_owner") });
  const auth = { student, owner: { token: owner.token, user: owner.user } };
  const roster = (await (await fetch(`${API}/admin/roster`, { headers: { authorization: `Bearer ${owner.token}` } })).json()) as { studentId: string }[];
  if (roster[0]) for (const tab of ["", "?tab=results", "?tab=attendance", "?tab=billing", "?tab=parents", "?tab=activity", "?tab=settings"]) EXTRA_ADMIN.push(`/students/${roster[0].studentId}${tab}`);

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const report: Row[] = [];
  try {
    if (which !== "admin") for (const [w, sc] of WIDTHS ? WIDTHS.map((x) => [x, "light"] as const) : ([[390, "light"], [390, "dark"]] as const)) await run(browser, out, report, "miniapp", w, sc, auth);
    if (which !== "miniapp") for (const w of WIDTHS ?? [1440, 390]) await run(browser, out, report, "admin", w, "light", auth);
  } finally {
    await browser.close();
  }
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));

  const axeTotal = report.reduce((n, r) => n + r.axe.length, 0);
  const errTotal = report.reduce((n, r) => n + r.errors.length, 0);
  const overflow = report.filter((r) => r.overflow > 0);
  console.log(`\n${report.length} sahifa · axe: ${axeTotal} · xato: ${errTotal} · toshish: ${overflow.length}`);
  for (const r of report) {
    const issues = [...r.axe.map((a) => `axe ${a.id} (${a.n})`), ...r.errors, ...(r.overflow > 0 ? [`toshish ${r.overflow}px`] : [])];
    if (issues.length) console.log(`  ${r.app} ${r.width} ${r.scheme} ${r.route}: ${issues.join("; ")}`);
  }
  console.log(`Skrinshotlar: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
